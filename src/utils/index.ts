export const logger = (...args: unknown[]) => console.log(...args);


async function f2(data: unknown) {
    if (typeof data === "number") {
        return data * 100
    }
    return data
}