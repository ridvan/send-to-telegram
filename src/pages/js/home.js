import { getStorageDataByKey } from '../../handlers/storage.js';
import { timestampToReadableDate } from '../../utils.js';

const removeExtensionBadge = async () => {
    await chrome.action.setBadgeText({ text: '' })
}

const highlightLogsButton = () => {
    const logsButton = document.querySelector('.logs.tooltip');
    const logsTooltipText = document.querySelector('.logs .tooltiptext');
    logsButton.style.backgroundColor = '#8b000024';
    logsTooltipText.style.visibility = 'visible';
    logsTooltipText.style.opacity = '1';
}

const handleMessageError = async () => {
    const badgeText = await chrome.action.getBadgeText({});
    if (badgeText !== 'Fail') return true;

    await removeExtensionBadge();
    highlightLogsButton();
}

const uppercaseFirstLetter = (str) => {
    return str[0].toUpperCase() + str.slice(1);
}

const getLastMessageByStatus = async status => {
    const logs = await getStorageDataByKey('messageLogs');
    const firstOfType = logs.find(log => log.status === status);
    if (firstOfType) {
        return `&bull; ${uppercaseFirstLetter(firstOfType.type)} at ${timestampToReadableDate(firstOfType.timestamp)}`;
    } else {
        return `&bull; none yet 👀`;
    }
}

const handleStatistics = async () => {
    const totalSent = await getStorageDataByKey('totalMessageCount');
    if (totalSent === 1) document.getElementById('message-word').innerText = 'message';
    document.getElementById('total-message-count').innerText = totalSent || 0;
    ['success', 'fail'].map(
        async status => document.getElementById(`last-${status}-message`).innerHTML = await getLastMessageByStatus(status)
    );
}

document.addEventListener('DOMContentLoaded', async () => {
    await handleStatistics();
    await handleMessageError();
});
