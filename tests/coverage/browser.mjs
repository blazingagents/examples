// Converts Playwright JSCoverage dumps (coverage/browser/raw) into an Istanbul
// report for the authored UI files. Vite dev modules carry inline data: source
// maps; built assets (next start, vite preview) carry sibling .js.map files.
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodedMap, FlattenMap } from "@jridgewell/trace-mapping";
import istanbulLibCoverage from "istanbul-lib-coverage";
import istanbulLibReport from "istanbul-lib-report";
import istanbulReports from "istanbul-reports";
import v8toIstanbul from "v8-to-istanbul";

const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;
const { create } = istanbulReports;

const root = resolve(".");
const rawDirectory = join(root, "coverage/browser/raw");
const reportDirectory = join(root, "coverage/browser");

const include = [
	"tanstack-start-ai-sdk/src/routes/index.tsx",
	"vite-express-ai-sdk/src/App.tsx",
	"vite-hono-ai-sdk/src/App.tsx",
	"vite-fastapi-ai-sdk/src/App.tsx",
];
const included = new Set(include.map((file) => resolve(root, file)));

// Maps a served asset URL to the file on disk that produced it.
const assetRoots = [
	[
		/^\/assets\//,
		(path) => join(root, "tanstack-start-ai-sdk/dist/client", path),
	],
	[/^\/@fs\//, (path) => path.slice(4)],
];

const scriptPath = (url, example) => {
	try {
		const path = new URL(url).pathname;
		for (const [pattern, translate] of assetRoots)
			if (pattern.test(path)) return translate(path);
		return join(root, example, path);
	} catch {
		return;
	}
};

// Returns the source map plus the directory its sources resolve against.
const sourceMap = (source, scriptFile) => {
	const match = /\/\/#\s*sourceMappingURL=(\S+)\s*$/.exec(source);
	if (!match) return;
	if (match[1].startsWith("data:")) {
		const data = match[1].slice(match[1].indexOf(",") + 1);
		const map = match[1].includes(";base64")
			? JSON.parse(Buffer.from(data, "base64").toString())
			: JSON.parse(decodeURIComponent(data));
		return { map, dir: dirname(scriptFile) };
	}
	const mapPath = resolve(
		dirname(scriptFile),
		decodeURIComponent(match[1]),
	);
	try {
		return { map: JSON.parse(readFileSync(mapPath, "utf8")), dir: dirname(mapPath) };
	} catch {
		return;
	}
};

const normalizeSource = (source, base) => {
	if (source.startsWith("turbopack:///[project]/"))
		return resolve(root, source.slice("turbopack:///[project]/".length));
	if (source.startsWith("file://")) return fileURLToPath(source);
	if (source.startsWith("/")) return source;
	if (source.includes("://") || source.startsWith("<")) return source;
	return resolve(base, source);
};

const coverageMap = createCoverageMap({});

for (const example of readdirSync(rawDirectory)) {
	let entries = [];
	for (const file of readdirSync(join(rawDirectory, example))) {
		if (!file.endsWith(".json")) continue;
		entries = entries.concat(
			JSON.parse(readFileSync(join(rawDirectory, example, file), "utf8")),
		);
	}
	for (const entry of entries) {
		if (!entry.source || !entry.functions?.length) continue;
		const script = scriptPath(entry.url, example);
		if (!script) continue;
		const mapped = sourceMap(entry.source, script);
		if (!mapped) continue;
		const { map, dir } = mapped;
		if (map.sections) Object.assign(map, encodedMap(new FlattenMap(map)));
		map.sources = map.sources?.map((source) =>
			normalizeSource(source, dir),
		);
		const converter = v8toIstanbul(script, 0, {
			source: entry.source,
			sourceMap: { sourcemap: map },
		});
		await converter.load();
		converter.applyCoverage(entry.functions);
		for (const [path, coverage] of Object.entries(converter.toIstanbul())) {
			const canonical = path.split("?")[0];
			if (!included.has(canonical)) continue;
			coverageMap.addFileCoverage({ ...coverage, path: canonical });
		}
	}
}

// Zero entries for included files no page loaded.
for (const path of included) {
	if (coverageMap.data[path]) continue;
	const source = readFileSync(path, "utf8");
	const converter = v8toIstanbul(path, 0, { source });
	await converter.load();
	converter.applyCoverage([
		{
			functionName: "(empty-report)",
			isBlockCoverage: false,
			ranges: [{ startOffset: 0, endOffset: source.length, count: 0 }],
		},
	]);
	coverageMap.merge(converter.toIstanbul());
}

mkdirSync(reportDirectory, { recursive: true });
const context = createContext({ dir: reportDirectory, coverageMap });
for (const name of ["text", "json", "json-summary"])
	create(name).execute(context);
for (const file of include) {
	const summary = coverageMap
		.fileCoverageFor(resolve(root, file))
		.toSummary();
	for (const metric of ["lines", "branches", "functions", "statements"]) {
		const pct = summary.data[metric].pct;
		if (pct < 99) {
			console.error(
				`ERROR: Coverage for ${metric} (${pct}%) in ${file} does not meet threshold (99%)`,
			);
			process.exitCode = 1;
		}
	}
}
