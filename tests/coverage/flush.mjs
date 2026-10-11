const exits = { SIGINT: 130, SIGTERM: 143 };
for (const [signal, code] of Object.entries(exits))
	process.on(signal, () => process.exit(code));
