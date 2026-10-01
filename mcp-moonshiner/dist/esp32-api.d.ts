export declare function getBase(): string;
export declare function getAuth(): string;
/**
 * Parses a raw entity payload from the ESPHome web_server v3 REST API.
 *
 * The device returns JSON objects like {"value":72.5,"state":"72.5 °C"} for
 * typed entities, but plain text for others. Strategy:
 *   1. If the payload looks like JSON (wrapped in {} or []), try to parse it.
 *      On failure fall through with value=null and the raw string as state -
 *      deliberately silent since PR #92: parse failures here are routine
 *      (partial reads mid-frame) and logging them only polluted MCP stderr.
 *   2. Otherwise, attempt a bare numeric parse; non-numerics stay null.
 */
export declare function parseState(raw: string): {
    value: number | null;
    state: string;
};
export interface TempReading {
    entity: string;
    value: number | null;
    raw: string;
}
export declare function validateId(id: string): void;
export declare const readSensor: (id: string) => Promise<TempReading>;
export declare const readNumber: (id: string) => Promise<TempReading>;
export declare const readTextSensor: (id: string) => Promise<string>;
export declare const readBinarySensor: (id: string) => Promise<boolean>;
export declare const setNumber: (id: string, value: number) => Promise<void>;
export declare const toggleSwitch: (id: string, on: boolean) => Promise<void>;
export declare const pressButton: (id: string) => Promise<void>;
export declare function getAllTemperatures(): Promise<{
    column: TempReading;
    tank: TempReading;
}>;
export declare function getAllStatus(): Promise<Record<string, unknown>>;
/**
 * Runs async tasks with bounded concurrency, preserving input order in the
 * output. Tasks are thunks so nothing is executed until it starts;
 * Uses a rolling window approach to keep concurrency level at batchSize.
 */
export declare function runBatched<T>(tasks: (() => Promise<T>)[], batchSize: number): Promise<T[]>;
