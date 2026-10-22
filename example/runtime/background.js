
import readline from "node:readline";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

const input = readline.createInterface({
    input: process.stdin,
    terminal: false,
});

const pendingRequests = new Map();

function respond(id, result, error = null) {
    process.stdout.write(
        JSON.stringify({ id, result, error }) + "\n"
    );
}

const api = {
    app: {
        getInfo() {
            return {
                name: process.env.HTMLDESKTOP_APP_NAME ?? "HTMLDESKTOP App",
                version: process.env.HTMLDESKTOP_APP_VERSION ?? "0.1.0",
                platform: process.platform,
                architecture: process.arch,
            };
        },

        close() {
            return process.exit()
        }
    },

    system: {
        getPlatform() {
            return {
                platform: process.platform,
                architecture: process.arch,
                operatingSystem: os.type(),
                release: os.release(),
            };
        },

        getHomeDirectory() {
            return os.homedir();
        },
    },

    path: {
        join(...parts) {
            return path.join(...parts);
        },

        basename(value) {
            return path.basename(value);
        },

        dirname(value) {
            return path.dirname(value);
        },
    },

    fs: {
        async readTextFile(filePath) {
            return fs.readFile(filePath, "utf8");
        },

        async writeTextFile(filePath, content) {
            await fs.writeFile(filePath, content, "utf8");
            return true;
        },

        async exists(filePath) {
            try {
                await fs.access(filePath);
                return true;
            } catch {
                return false;
            }
        },
    },
};

function getMethod(methodName) {
    const parts = methodName.split(".");
    let current = api;

    for (const part of parts) {
        if (
            !part ||
            part === "__proto__" ||
            part === "prototype" ||
            part === "constructor"
        ) {
            throw new Error("Invalid API method.");
        }

        current = current?.[part];
    }

    if (typeof current !== "function") {
        throw new Error(`Unknown API method: ${methodName}`);
    }

    return current;
}

async function handleRequest(message) {
    const { id, method, args = [] } = message;

    if (
        typeof id !== "string" ||
        typeof method !== "string" ||
        !Array.isArray(args)
    ) {
        return;
    }

    try {
        const fn = getMethod(method);
        const result = await fn(...args);
        respond(id, result);
    } catch (error) {
        respond(id, null, {
            message: error instanceof Error
                ? error.message
                : String(error),
        });
    }
}

input.on("line", (line) => {
    let message;

    try {
        message = JSON.parse(line);
    } catch {
        return;
    }

    void handleRequest(message);
});

input.on("close", () => {
    process.exit(0);
});

// Send a startup message so the native host can confirm readiness.
process.stdout.write(
    JSON.stringify({
        event: "runtime.ready",
        runtime: "htmldesktop",
        version: 1,
    }) + "\n"
);
