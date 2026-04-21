import Foundation
import HuggingFace
import MLXHuggingFace
import MLXLLM
import MLXLMCommon
import Tokenizers

struct CategorizeRequest: Decodable {
    let op: String
    let requestId: String?
    let activity: ActivityInput?
    let projects: [ProjectInput]?
    let examples: [ExampleInput]?
    let modelId: String?
}

struct ActivityInput: Decodable {
    let app: String
    let title: String
}

struct ProjectInput: Decodable {
    let id: String
    let name: String
    let description: String?
}

struct ExampleInput: Decodable {
    let app: String
    let title: String
    let projectId: String
    let projectName: String
}

struct CategorizeResult: Encodable {
    let projectId: String?
    let confidence: Double
    let reason: String
}

struct Response<T: Encodable>: Encodable {
    let ok: Bool
    let requestId: String?
    let op: String
    let data: T?
    let error: String?
}

struct EmptyPayload: Encodable {}

struct StatusPayload: Encodable {
    let ready: Bool
    let modelId: String?
}

let defaultModelId = "Qwen/Qwen3-0.6B-MLX-4bit"

actor LLMService {
    private var container: ModelContainer?
    private var loadedModelId: String?

    func loadIfNeeded(modelId: String) async throws {
        if loadedModelId == modelId, container != nil { return }
        let configuration = ModelConfiguration(id: modelId)
        let loaded = try await #huggingFaceLoadModelContainer(configuration: configuration)
        container = loaded
        loadedModelId = modelId
    }

    func categorize(
        activity: ActivityInput,
        projects: [ProjectInput],
        examples: [ExampleInput],
        modelId: String
    ) async throws -> CategorizeResult {
        try await loadIfNeeded(modelId: modelId)
        guard let container else {
            return CategorizeResult(projectId: nil, confidence: 0, reason: "model unavailable")
        }

        let prompt = buildPrompt(activity: activity, projects: projects, examples: examples)

        let output = try await container.perform { context in
            let userInput = UserInput(prompt: prompt)
            let input = try await context.processor.prepare(input: userInput)
            var generated = ""
            let parameters = GenerateParameters(temperature: 0.1)
            for await item in try MLXLMCommon.generate(
                input: input,
                parameters: parameters,
                context: context
            ) {
                switch item {
                case .chunk(let chunk):
                    generated += chunk
                    if generated.contains("}") { return generated }
                case .info:
                    return generated
                case .toolCall:
                    continue
                }
            }
            return generated
        }

        return parseModelOutput(output, projects: projects)
    }

    func status() -> StatusPayload {
        StatusPayload(ready: container != nil, modelId: loadedModelId)
    }
}

func buildPrompt(
    activity: ActivityInput,
    projects: [ProjectInput],
    examples: [ExampleInput]
) -> String {
    var lines: [String] = []
    lines.append(
        "You label a work activity with exactly one project id from the list, or null when none fit."
    )
    lines.append("Respond with a single JSON object: {\"projectId\": \"<id|null>\", \"confidence\": 0-1, \"reason\": \"<short>\"}. No prose.")
    lines.append("")
    lines.append("Projects:")
    for project in projects {
        let desc = project.description.map { " — \($0)" } ?? ""
        lines.append("- id=\(project.id) name=\"\(project.name)\"\(desc)")
    }
    if !examples.isEmpty {
        lines.append("")
        lines.append("Past confirmed assignments (learn from these):")
        for example in examples.suffix(20) {
            lines.append(
                "- app=\"\(example.app)\" title=\"\(example.title)\" → \(example.projectId) (\(example.projectName))"
            )
        }
    }
    lines.append("")
    lines.append("Classify this activity:")
    lines.append("- app=\"\(activity.app)\"")
    lines.append("- title=\"\(activity.title)\"")
    lines.append("")
    lines.append("JSON:")
    return lines.joined(separator: "\n")
}

func parseModelOutput(_ raw: String, projects: [ProjectInput]) -> CategorizeResult {
    guard let start = raw.firstIndex(of: "{"),
          let end = raw.range(of: "}", options: .backwards) else {
        return CategorizeResult(projectId: nil, confidence: 0, reason: "no json")
    }
    let jsonString = String(raw[start...end.lowerBound])

    struct Parsed: Decodable {
        let projectId: String?
        let confidence: Double?
        let reason: String?
    }

    guard let data = jsonString.data(using: .utf8),
          let parsed = try? JSONDecoder().decode(Parsed.self, from: data) else {
        return CategorizeResult(projectId: nil, confidence: 0, reason: "parse fail")
    }
    let validIds = Set(projects.map(\.id))
    let id = parsed.projectId.flatMap { validIds.contains($0) ? $0 : nil }
    let confidence = parsed.confidence ?? (id != nil ? 0.5 : 0)
    let reason = parsed.reason ?? ""
    return CategorizeResult(projectId: id, confidence: max(0, min(1, confidence)), reason: reason)
}

let outputQueue = DispatchQueue(label: "no-time-llm.stdout")

func emit<T: Encodable>(_ response: Response<T>) {
    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(response) else { return }
    outputQueue.sync {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
}

func emitError(_ requestId: String?, op: String, message: String) {
    let response = Response<EmptyPayload>(
        ok: false,
        requestId: requestId,
        op: op,
        data: nil,
        error: message
    )
    emit(response)
}

@main
struct Main {
    static func main() async {
        let service = LLMService()
        signalReady()

        while let line = readLine(strippingNewline: true) {
            guard let data = line.data(using: .utf8) else { continue }
            await handleLine(data, service: service)
        }
    }

    static func signalReady() {
        let response = Response<StatusPayload>(
            ok: true,
            requestId: nil,
            op: "hello",
            data: StatusPayload(ready: false, modelId: nil),
            error: nil
        )
        emit(response)
    }

    static func handleLine(_ data: Data, service: LLMService) async {
        guard !data.isEmpty else { return }
        let decoder = JSONDecoder()
        guard let request = try? decoder.decode(CategorizeRequest.self, from: data) else {
            emitError(nil, op: "unknown", message: "invalid json")
            return
        }

        let modelId = request.modelId ?? defaultModelId

        switch request.op {
        case "status":
            let status = await service.status()
            emit(
                Response(
                    ok: true,
                    requestId: request.requestId,
                    op: request.op,
                    data: status,
                    error: nil
                )
            )
        case "load":
            do {
                try await service.loadIfNeeded(modelId: modelId)
                let status = await service.status()
                emit(
                    Response(
                        ok: true,
                        requestId: request.requestId,
                        op: request.op,
                        data: status,
                        error: nil
                    )
                )
            } catch {
                emitError(request.requestId, op: request.op, message: error.localizedDescription)
            }
        case "categorize":
            guard let activity = request.activity, let projects = request.projects else {
                emitError(request.requestId, op: request.op, message: "missing activity or projects")
                return
            }
            let examples = request.examples ?? []
            do {
                let result = try await service.categorize(
                    activity: activity,
                    projects: projects,
                    examples: examples,
                    modelId: modelId
                )
                emit(
                    Response(
                        ok: true,
                        requestId: request.requestId,
                        op: request.op,
                        data: result,
                        error: nil
                    )
                )
            } catch {
                emitError(request.requestId, op: request.op, message: error.localizedDescription)
            }
        default:
            emitError(request.requestId, op: request.op, message: "unknown op")
        }
    }
}
