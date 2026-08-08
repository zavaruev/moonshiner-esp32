/**
 * @jest-environment jsdom
 */

// Mock globals required by the IIFE in moonshiner_ui_v24.js
window.matchMedia = jest.fn().mockImplementation(query => {
    return {
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // deprecated
        removeListener: jest.fn(), // deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    };
});

window.EventSource = class {
  addEventListener() {}
  onerror() {}
};

const { debounce } = require('./moonshiner_ui_v24.js');

describe('debounce function from moonshiner_ui_v24.js', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should only call the function once after the specified wait time', () => {
        const mockFn = jest.fn();
        const debouncedFn = debounce(mockFn, 1000);

        debouncedFn();
        debouncedFn();
        debouncedFn();

        // The function should not have been called yet
        expect(mockFn).not.toHaveBeenCalled();

        // Fast-forward time
        jest.advanceTimersByTime(1000);

        // Now the function should have been called exactly once
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should call the function with the correct arguments', () => {
        const mockFn = jest.fn();
        const debouncedFn = debounce(mockFn, 1000);

        debouncedFn('test', 123);

        jest.advanceTimersByTime(1000);

        expect(mockFn).toHaveBeenCalledWith('test', 123);
    });

    it('should reset the timer if called again before the wait time is up', () => {
        const mockFn = jest.fn();
        const debouncedFn = debounce(mockFn, 1000);

        debouncedFn();
        jest.advanceTimersByTime(500); // Wait half the time

        debouncedFn(); // Call again, which should reset the timer
        jest.advanceTimersByTime(500); // Wait the other half

        // Function should not be called yet because the timer was reset
        expect(mockFn).not.toHaveBeenCalled();

        // Wait the remaining 500ms
        jest.advanceTimersByTime(500);

        // Now it should be called
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should preserve the "this" context', () => {
        const context = { value: 'context_value' };

        // We use a regular function, not an arrow function, so we can access `this`
        const mockFn = jest.fn(function() {
            expect(this.value).toBe('context_value');
        });

        const debouncedFn = debounce(mockFn, 1000);

        // Call the debounced function with the specified context
        debouncedFn.call(context);

        jest.advanceTimersByTime(1000);

        expect(mockFn).toHaveBeenCalledTimes(1);
    });
});
