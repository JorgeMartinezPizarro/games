
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
export default function getTimeMicro() {
    var hrTime = process.hrtime()
    const a = hrTime[0] * 1000000 + hrTime[1] / 1000
    return Math.round(a)
}