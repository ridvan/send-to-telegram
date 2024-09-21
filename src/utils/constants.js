export const defaultSettings = {
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
            sendAs: 'photo', // or 'document' - 'link'?
            addSourceLink: true,
            useWeservProxy: false
            // prefetch weserv url?
        }
    },
    logs: {
        active: true,
        type: 'everything' // or 'timestamp'
    },
    hashtags: {
        active: false,
        use: 0,
        setup: {
            0: {
                tags: ['links', 'work', 'fun', 'personal', 'art', 'news'],
                default: {
                    active: false,
                    tagIndex: 0
                }
            }
        }
    }
};

export const messageTypes = ['text', 'photo', 'document', 'link', 'page', 'me'];

export const iconTypes = [...messageTypes, 'noLogs', 'tabUrl', 'deleteLog', 'success', 'success-bold', 'fail', 'calendar'];

export const apiBaseUrl = 'https://api.telegram.org';
