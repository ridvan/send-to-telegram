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

document.addEventListener('DOMContentLoaded', async () => {
    await handleMessageError();
});
