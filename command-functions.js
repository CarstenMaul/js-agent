export const commandFunctions = [
    {
        name: "test-echotest",
        description: "Test the function calling functionality with an echo message.",
        parameters: {
            type: "object",
            properties: {
                echomessage: {
                    type: "string",
                    description: "This is the message to be echoed."
                }
            },
            required: ["echomessage"]
        }
    },
    {
        name: "test-getdatetime",
        description: "This function will return the current date and time.",
        parameters: {}
    }
]