
export function errorMessage(error: Error | any, traceLength: number = 10): string {
    let message: string;
    if (error instanceof Error) {
        message = error.stack || "";
        console.error("An Error occurred.");
        console.error("==================");
        console.error(message.split("\n").slice(0, traceLength));
    } else {
        message = String(error);
    }
    return message.split("\n").slice(0, traceLength).join("\n");
}