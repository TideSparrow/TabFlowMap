import { t } from "../i18n";
// Keep Chrome's message channel open until the map's queued operation finishes.
// Promise-returning onMessage listeners are not supported in every Chrome environment.
export function replyToMapMessage(response: Promise<unknown>, sendResponse: (value: unknown) => void): true {
    void response.then(sendResponse, (cause) => sendResponse({
        ok: false,
        error: cause instanceof Error ? cause.message : t("m027"),
    }));
    return true;
}
