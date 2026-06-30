// Mock matchMedia before requiring the file
window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
}));

// Mock EventSource
global.EventSource = class EventSource {
    constructor(url) {
        this.url = url;
    }
    addEventListener() {}
    close() {}
};

const { debounce } = require('../moonshiner_ui_v24.js');

// Setup Jest fake timers
jest.useFakeTimers();

describe('debounce function', () => {
    let func;

    beforeEach(() => {
        func = jest.fn();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    test('should execute the function after the specified wait time', () => {
        const debouncedFunc = debounce(func, 100);

        debouncedFunc();
        expect(func).not.toHaveBeenCalled();

        // Fast-forward time
        jest.advanceTimersByTime(50);
        expect(func).not.toHaveBeenCalled();

        jest.advanceTimersByTime(50);
        expect(func).toHaveBeenCalledTimes(1);
    });

    test('should reset the timer if called again before wait time completes', () => {
        const debouncedFunc = debounce(func, 100);

        debouncedFunc();
        jest.advanceTimersByTime(50);

        // Call again before 100ms
        debouncedFunc();

        // Original 100ms has passed, but it shouldn't be called because timer reset
        jest.advanceTimersByTime(50);
        expect(func).not.toHaveBeenCalled();

        // New 100ms has passed
        jest.advanceTimersByTime(50);
        expect(func).toHaveBeenCalledTimes(1);
    });

    test('should pass arguments to the original function', () => {
        const debouncedFunc = debounce(func, 100);

        debouncedFunc('arg1', 'arg2');
        jest.advanceTimersByTime(100);

        expect(func).toHaveBeenCalledWith('arg1', 'arg2');
    });

    test('should preserve "this" context', () => {
        const context = { value: 42 };
        let capturedThis;

        const myFunc = function() {
            capturedThis = this;
        };

        const debouncedFunc = debounce(myFunc, 100);

        debouncedFunc.call(context);
        jest.advanceTimersByTime(100);

        expect(capturedThis).toBe(context);
    });

    test('should only call the function once after multiple rapid invocations', () => {
        const debouncedFunc = debounce(func, 100);

        debouncedFunc();
        debouncedFunc();
        debouncedFunc();
        debouncedFunc();

        jest.advanceTimersByTime(100);

        expect(func).toHaveBeenCalledTimes(1);
    });
});
