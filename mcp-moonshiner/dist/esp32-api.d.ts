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
