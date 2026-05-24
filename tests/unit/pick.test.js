const pick = require('../../src/utils/pick');

describe('pick', () => {
    test('filters to only specified keys', () => {
        const obj = { a: 1, b: 2, c: 3 };
        const result = pick(obj, ['a', 'c']);
        expect(result).toEqual({ a: 1, c: 3 });
    });

    test('excludes keys not in the whitelist', () => {
        const obj = { a: 1, b: 2, c: 3 };
        const result = pick(obj, ['a']);
        expect(result).not.toHaveProperty('b');
        expect(result).not.toHaveProperty('c');
    });

    test('skips undefined values in source', () => {
        const obj = { a: 1, b: undefined, c: 3 };
        const result = pick(obj, ['a', 'b', 'c']);
        expect(result).toEqual({ a: 1, c: 3 });
        expect(result).not.toHaveProperty('b');
    });

    test('includes null values', () => {
        const obj = { a: null, b: 2 };
        const result = pick(obj, ['a', 'b']);
        expect(result).toEqual({ a: null, b: 2 });
    });

    test('returns empty object for empty keys', () => {
        const obj = { a: 1 };
        const result = pick(obj, []);
        expect(result).toEqual({});
    });

    test('returns empty object for empty source', () => {
        const result = pick({}, ['a']);
        expect(result).toEqual({});
    });
});
