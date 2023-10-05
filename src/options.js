export const defaultSettings= {
    connections: {
        use: 0,
        setup: {
            0: {
                name: 'Default',
                key: '',
                chatId: ''
            }
        },
    },
    actions: {
        sendMessage: {
            disableNotificationSound: true,
            disablePreview: true,
            addSourceLink: true
        },
        sendImage: {
            disableNotificationSound: true,
            disablePreview: false,
            sendAs: 'image', // or 'document' - 'link'?
            addSourceLink: true,
            useWeservProxy: false
            // prefetch weserv url?
        }
    },
    logs: {
        active: true,
        type: 'everything' // or 'timestamp'
    }
}
