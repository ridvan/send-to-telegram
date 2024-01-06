import { iconTypes } from './constants.js';

export const getIconPath = function (type) {
    if(!iconTypes.includes(type)) return false;

    const iconMap = {
        'text': 'text-aa',
        'photo': 'image',
        'document': 'image',
        'page': 'article',
        'link': 'link-simple',
        'noLogs': 'paper-plane-tilt-duotone',
        'tabUrl': 'arrow-up-right-light',
        'deleteLog': 'trash-light',
        'success': 'checks',
        'success-bold': 'check-bold',
        'fail': 'x',
        'calendar': 'calendar-blank'
    };

    return `../../assets/icons/phospor-icons/${iconMap[type]}-ph.svg`;
}
