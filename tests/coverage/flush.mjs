// Writes coverage as soon as a termination signal arrives, since framework
// parents (e.g. `next start`) SIGKILL their server child on their own exit,
// and process-group kills give children no time to finish an exit-time write.
// Exits only when it is the sole listener so framework-installed handlers can
// still run their graceful shutdown.
import { writeFileSync } from "node:fs";
import inspector from "node:inspector";
import { join } from "node:path";

const exits = { SIGINT: 130, SIGTERM: 143 };
const directory = process.env.NODE_V8_COVERAGE;

const session = new inspector.Session();
session.connect();
session.post("Profiler.enable", () =>
	session.post("Profiler.startPreciseCoverage", {
		callCount: true,
		detailed: true,
	}),
);

function dump(done) {
	session.post("Profiler.takePreciseCoverage", (error, data) => {
		if (!error && directory && data)
			try {
				writeFileSync(
					join(directory, `coverage-${process.pid}-${Date.now()}-signal.json`),
					JSON.stringify({ result: data.result }),
				);
			} catch {}
		done();
	});
}

for (const [signal, code] of Object.entries(exits))
	process.on(signal, () => {
		if (process.listenerCount(signal) === 1) {
			const timer = setTimeout(() => process.exit(code), 2000);
			dump(() => {
				clearTimeout(timer);
				process.exit(code);
			});
		} else {
			dump(() => {});
		}
	});
