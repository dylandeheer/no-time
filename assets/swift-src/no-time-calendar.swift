import Foundation
import EventKit

struct JSONResponse<T: Encodable>: Encodable {
    let ok: Bool
    let data: T?
    let error: String?
    let code: String?
}

struct CalendarInfo: Encodable {
    let id: String
    let title: String
    let source: String
    let color: String
    let allowsModifications: Bool
}

struct EventInfo: Encodable {
    let id: String
    let calendarId: String
    let calendarTitle: String
    let title: String
    let start: String
    let end: String
    let durationSeconds: Int
    let isAllDay: Bool
    let location: String?
    let notes: String?
}

struct AuthStatus: Encodable {
    let status: String
}

func emit<T: Encodable>(_ value: JSONResponse<T>) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = []
    do {
        let data = try encoder.encode(value)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    } catch {
        FileHandle.standardError.write(Data("encoding error: \(error)\n".utf8))
        exit(2)
    }
}

func emitError(_ message: String, code: String = "error") -> Never {
    struct Empty: Encodable {}
    let response = JSONResponse<Empty>(ok: false, data: nil, error: message, code: code)
    emit(response)
    exit(1)
}

func emitSuccess<T: Encodable>(_ data: T) {
    let response = JSONResponse<T>(ok: true, data: data, error: nil, code: nil)
    emit(response)
}

func statusString(_ status: EKAuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "not-determined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorized: return "authorized"
    case .fullAccess: return "authorized"
    case .writeOnly: return "write-only"
    @unknown default: return "unknown"
    }
}

func currentAuthStatus() -> EKAuthorizationStatus {
    return EKEventStore.authorizationStatus(for: .event)
}

func requestAccess() async -> EKAuthorizationStatus {
    let store = EKEventStore()
    if #available(macOS 14.0, *) {
        do {
            _ = try await store.requestFullAccessToEvents()
        } catch {
            FileHandle.standardError.write(Data("access request error: \(error)\n".utf8))
        }
    } else {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            store.requestAccess(to: .event) { _, _ in
                cont.resume()
            }
        }
    }
    return currentAuthStatus()
}

func isAuthorized(_ status: EKAuthorizationStatus) -> Bool {
    if status == .authorized { return true }
    if #available(macOS 14.0, *) {
        if status == .fullAccess { return true }
    }
    return false
}

func loadStore() -> EKEventStore {
    let store = EKEventStore()
    _ = store
    return store
}

func listCalendars() {
    let status = currentAuthStatus()
    guard isAuthorized(status) else {
        emitError("calendar access not granted", code: statusString(status))
    }

    let store = loadStore()
    let calendars = store.calendars(for: .event)
    let infos = calendars.map { cal in
        CalendarInfo(
            id: cal.calendarIdentifier,
            title: cal.title,
            source: cal.source.title,
            color: cal.cgColor.map { hexString(from: $0) } ?? "#888888",
            allowsModifications: cal.allowsContentModifications
        )
    }
    emitSuccess(infos)
}

func hexString(from color: CGColor) -> String {
    guard let components = color.components else { return "#888888" }
    let r = Int((components.count > 0 ? components[0] : 0) * 255)
    let g = Int((components.count > 1 ? components[1] : 0) * 255)
    let b = Int((components.count > 2 ? components[2] : 0) * 255)
    return String(format: "#%02x%02x%02x", r, g, b)
}

func parseDate(_ input: String) -> Date? {
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime]
    if let d = isoFormatter.date(from: input) { return d }

    let ymd = DateFormatter()
    ymd.dateFormat = "yyyy-MM-dd"
    ymd.timeZone = TimeZone.current
    return ymd.date(from: input)
}

func listEvents(startStr: String, endStr: String, calendarIds: [String]?) {
    let status = currentAuthStatus()
    guard isAuthorized(status) else {
        emitError("calendar access not granted", code: statusString(status))
    }

    guard let start = parseDate(startStr), let endRaw = parseDate(endStr) else {
        emitError("invalid date format (expect yyyy-MM-dd or ISO-8601)", code: "bad-input")
    }

    let startOfDay = Calendar.current.startOfDay(for: start)
    let end: Date = {
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: endRaw)
        comps.hour = 23
        comps.minute = 59
        comps.second = 59
        return Calendar.current.date(from: comps) ?? endRaw
    }()

    let store = loadStore()
    let availableCalendars = store.calendars(for: .event)
    let filteredCalendars: [EKCalendar]
    if let ids = calendarIds, !ids.isEmpty {
        let idSet = Set(ids)
        filteredCalendars = availableCalendars.filter { idSet.contains($0.calendarIdentifier) }
    } else {
        filteredCalendars = availableCalendars
    }

    let predicate = store.predicateForEvents(withStart: startOfDay, end: end, calendars: filteredCalendars)
    let events = store.events(matching: predicate)

    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime]

    let infos = events.map { ev -> EventInfo in
        let duration = Int(ev.endDate.timeIntervalSince(ev.startDate))
        return EventInfo(
            id: ev.eventIdentifier ?? UUID().uuidString,
            calendarId: ev.calendar.calendarIdentifier,
            calendarTitle: ev.calendar.title,
            title: ev.title ?? "(untitled)",
            start: isoFormatter.string(from: ev.startDate),
            end: isoFormatter.string(from: ev.endDate),
            durationSeconds: max(0, duration),
            isAllDay: ev.isAllDay,
            location: ev.location,
            notes: ev.notes
        )
    }
    emitSuccess(infos)
}

func checkAuth(request: Bool) async {
    var status = currentAuthStatus()
    if request && status == .notDetermined {
        status = await requestAccess()
    }
    emitSuccess(AuthStatus(status: statusString(status)))
}

@main
struct Main {
    static func main() async {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            emitError("usage: no-time-calendar <auth|list-calendars|events> [args]", code: "usage")
        }

        switch args[1] {
        case "auth":
            let shouldRequest = args.count > 2 && args[2] == "--request"
            await checkAuth(request: shouldRequest)
        case "list-calendars":
            listCalendars()
        case "events":
            guard args.count >= 4 else {
                emitError("usage: events <start> <end> [calendar-id,...]", code: "usage")
            }
            let ids = args.count >= 5 ? args[4].split(separator: ",").map(String.init) : nil
            listEvents(startStr: args[2], endStr: args[3], calendarIds: ids)
        default:
            emitError("unknown command: \(args[1])", code: "usage")
        }
    }
}
