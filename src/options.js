// LOGS ??

const options = {
    connections: {
        use: 0,
        0: {
            name: 'Messenger',
            key: 'BOT_TOKEN',
            chatId: 'CHAT_ID'
        },
    },
    actions: {
        sendMessage: {
            silent: true,
            disablePreview: true,
            buttons: {
                active: true,
                list: {
                    source: true,
                    waybackMachine: false
                }
            }
        },
        sendImage: {
            silent: true,
            disablePreview: false,
            buttons: {
                active: true,
                list: {
                    source: true,
                    weserv: false
                    // prefetch weserv url?
                }
            }
        }
    }
}
