import { mountMap } from "../../mount-map";

const mode = new URLSearchParams(location.search).get("mode") === "embedded" ? "embedded" : "window";
void mountMap(mode);
