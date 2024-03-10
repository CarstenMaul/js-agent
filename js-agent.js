
/**
 * Public Class AI Agent
 * @param {Object} [options={}]
 * @param {String} [options.oaiUrl = "https://api.openai.com/v1/chat/completions"]
 * @param {String} [options.oaiApiKey]
 * @param {String} [options.systemMessage]
 * @param {String} [options.model = 'gpt-3.5-turbo']
 * @param {number} [options.temperature = 0.7]
 * @param {number} [options.maxTokens = 4096]
 * @param {Object} [options.services]
 * @param {Object[]} [options.commandFunctions]
 * @param {Object} [options.debugEnabled = false]
 * @param {Function} [options.aiResponseCallback]
 * @returns {Object}
 */
export function createAIAgent(options = {}) {
    const {
        oaiUrl = "https://api.openai.com/v1/chat/completions",
        oaiApiKey,
        systemMessage,
        model = 'gpt-3.5-turbo',
        temperature = 0.7,
        maxTokens = 4096,
        services,
        commandFunctions,
        aiResponseCallback = () => {},
        debugEnabled = false,
    } = options;

    const FUNCTIONS = commandFunctions;

    let recursionCounter = 0;
    const MAXRECURSIONS = 10;

    let agentIsBusy = false;

    let context = systemMessage
        ? [{ role: "system", content: systemMessage }]
        : [{ role: "system", content: "You are a friendly and helpfule agent. Answer the user questions as good as you can." }];


    /**
     * Private function Execute a command from command-functions.js
     * @param {*} command 
     * @param {*} service 
     * @returns 
     */
    async function executeServiceCommand(command, service) {

        const [serviceName, functionName] = command.name.split("-");
        const args = JSON.parse(command.arguments);

        if (debugEnabled)
            console.log("executeServiceCommand: Service name: " + serviceName + " Function name: " + functionName + " Arguments: " + JSON.stringify(args));

        try {
            // select the object of the service, then the command function and execute it with the arguments
            return await service[serviceName][functionName](args);
        } catch (error) {
            console.error("ERROR: executeServiceCommand " + error.message);
            throw new Error(error);
        }
    }


    /**
     * Private function perform an async fetch to the openai api in streaming mode.
     * Execute any function calls that the AI generates.
     * @param {*} context 
     * @returns 
     */
    async function getAIResponseStreaming( context ) {

        agentIsBusy = true;

        recursionCounter++;
        if (recursionCounter > MAXRECURSIONS) {
            console.log("ERROR: Recursion counter exceeded. Aborting.");
            throw new Error("Recursion counter exceeded. Aborting.");
        }

        // Prepare the body for the call to openai api
        const restCallData = {
                    "messages": context, 
                    "functions": FUNCTIONS,
                    "model": options.model,
                    "temperature": options.temperature, 
                    "max_tokens": options.maxTokens,
                    "stream": true
                }

        try {
            const response = await fetch(options.oaiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + options.oaiApiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(restCallData)
            });

            // Create a reader to read the response stream
            const reader = response.body.getReader();
            // Create a decoder to convert the stream to text
            const decoder = new TextDecoder("utf-8");

            let functionCallName = '';
            let functionCallArguments = '';
            let thisresponse = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const chunk = decoder.decode(value);

                // DEBUG
                console.log(chunk);

                const lines = chunk.split('\n');
                const parsedLines = lines
                    .map((line) => line.replace(/^data: /, "").trim()) // remove data: prefix
                    .filter((line) => line !== "" && line !== "[DONE]") // remove empty lines and [DONE] line
                    .map((line) => JSON.parse(line)); // parse JSON string

                for (const parsedLine of parsedLines) {

                    const { choices } = parsedLine;
                    const { delta } = choices[0];
                    const { content } = delta;
                    const { function_call } = delta;

                    if (content) {
                        // ai is generating a response, we can send it to the callback
                        aiResponseCallback(content);
                        //assemble the all response chunks into one response
                        thisresponse += content;
                    }

                    if ( function_call ) {

                        if ( debugEnabled)
                            console.log("function call detected");

                        if ( function_call.name ) {
                            // this is the first message of a function call, ai transmits the name of the function

                            if (debugEnabled)
                                console.log("Function call DETECTED. Function call name: " + function_call.name);

                            functionCallName = function_call.name;

                        }

                        if ( function_call.arguments) {
                            console.log("Function call arguments: " + function_call.arguments);
                            // ai generates the arguments of the function
                            functionCallArguments += function_call.arguments;
                        }
                    
                    }
                }
            }

            // if a function call was detected, we can execute the function and then recursively call the ai again
            if (functionCallName) {

                if (debugEnabled)
                    console.log("Function call name: " + functionCallName + " Function call arguments: " + functionCallArguments);
                
                const command = { name: functionCallName, arguments: functionCallArguments };

                try {
                    const serviceResult = await executeServiceCommand(command, services);
                } catch (error) {
                    console.error("ERROR: getAIResponseStreaming: executeServiceCommand ");
                    serviceResult = "Function " + functionCallName + " failed. Error: " + error.message;
                }

                if (debugEnabled)
                    console.log("Service result: " + serviceResult);

                context.push({ "role": "function", "name": functionCallName, "content": serviceResult });

                try {
                    const response = await getAIResponseStreaming( context ).then((response) => {
                        console.log("getAIResponseStreaming: Response: ", response);
                        thisresponse = response;
                    });
                } catch (error) {
                    console.error("ERROR: getAIResponseStreaming: Recursive call to getAIResponseStreaming failed. Error: " + error.message);
                    throw new Error(error);
                }
            }

            agentIsBusy = false;
            recursionCounter--;

            return thisresponse;

        
        } catch (error) {
            console.log('Error:', error);
            return "error: " + error;
        }
        
    }


    /**
     * Public function to process a user message
     * @param {*} usermessage 
     * @returns 
     */
    async function processMessage(usermessage) {

        try {
            let thisresponse = "";

            context.push({ role: "user", content: usermessage });

            if (debugEnabled)
                console.log("Context: ", context);

            await getAIResponseStreaming(context).then((response) => {
                if (debugEnabled)
                    console.log("processMessage: Response: ", response);
                thisresponse = response;
            });

            return thisresponse;

        } catch (error) {
            console.log('Error:', error);
            return "error: " + error;
        }
    }

    /**
     * Public function to check if the agent is available
     * @returns 
     */
    agentAvailable = () => {
        return !agentIsBusy;
    }

    // The public API (functions that we want to expose to the outside world)
    return {
        processMessage,
        agentAvailable
    };
}