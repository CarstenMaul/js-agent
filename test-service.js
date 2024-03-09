export function createTestService({ debugEnabled = false}) {

    const echotest = async function ({ echomessage }) {
        if (debugEnabled) {
            console.log('Testservice-echomessage called with message:', echomessage);
        }
        return echomessage;
    };

    const getdatetime = async function () {
        if (debugEnabled) {
            console.log('Testservice-getdatetime called.');
        }
        return new Date().toISOString();
    };

    return {
        echotest,
        getdatetime
    }

}