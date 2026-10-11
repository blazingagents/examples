// Normalizes V8 coverage so c8 can remap bundled framework output:
// - flattens sectioned ("index") source maps, which v8-to-istanbul rejects
// - rewrites map sources to absolute paths, since the include filter sees
//   raw source strings (file:// URLs or relative paths would be dropped)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodedMap, FlattenMap } from "@jridgewell/trace-mapping";

const directory = process.argv[2];

const flatten = (data) =>
	data?.sections ? encodedMap(new FlattenMap(data)) : data;

const absolutize = (data, base) => {
	if (!data?.sources) return data;
	data.sources = data.sources.map((source) => {
		if (source.startsWith("file://")) return fileURLToPath(source);
		if (source.startsWith("/")) return source;
		if (source.includes("://") || source.startsWith("<")) return source;
		return resolve(base, source);
	});
	return data;
};

const mapFileFor = (script) => {
	const match = /\/\/#\s*sourceMappingURL=([^\s]+)\s*$/.exec(script);
	if (!match || match[1].startsWith("data:")) return;
	return match[1];
};

for (const file of readdirSync(directory)) {
	if (!file.startsWith("coverage-")) continue;
	const path = join(directory, file);
	const coverage = JSON.parse(readFileSync(path, "utf8"));
	let changed = false;

	for (const [url, entry] of Object.entries(
		coverage["source-map-cache"] ?? {},
	)) {
		if (!entry.data) continue;
		entry.data = flatten(entry.data);
		entry.data = absolutize(
			entry.data,
			dirname(fileURLToPath(entry.url ?? url)),
		);
		changed = true;
	}

	for (const { url } of coverage.result ?? []) {
		let scriptPath;
		try {
			scriptPath = fileURLToPath(url);
		} catch {
			continue;
		}
		let script;
		try {
			script = readFileSync(scriptPath, "utf8");
		} catch {
			continue;
		}
		const reference = mapFileFor(script);
		if (!reference) continue;
		const mapPath = resolve(
			dirname(scriptPath),
			decodeURIComponent(reference),
		);
		let map;
		try {
			map = JSON.parse(readFileSync(mapPath, "utf8"));
		} catch {
			continue;
		}
		writeFileSync(
			mapPath,
			JSON.stringify(absolutize(flatten(map), dirname(mapPath))),
		);
	}

	if (changed) writeFileSync(path, JSON.stringify(coverage));
}
