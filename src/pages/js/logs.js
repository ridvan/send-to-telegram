import { timestampToReadableDate } from '../../utils.js';
import { getStorageData, setStorageData } from '../../handlers/storage.js';
import { messageTypes } from "../../options.js";

const getLogTypeIcon = function (type) {
    if(!['text', 'photo', 'document', 'page', 'link', 'noLogs', 'tabUrl', 'deleteLog'].includes(type)) return false;

    const iconMap = {
        'text': 'text-aa',
        'photo': 'image',
        'document': 'image',
        'page': 'article',
        'link': 'link-simple',
        'noLogs': 'paper-plane-tilt-duotone',
        'tabUrl': 'arrow-up-right-light',
        'deleteLog': 'trash-light'
    };

    return `../../assets/icons/phospor-icons/${iconMap[type]}-ph.svg`;
}

const getStatusIcon = function (status) {
    if(!['success', 'fail'].includes(status)) return false;

    const iconMap = {
        'success': 'checks',
        'fail': 'x'
    };

    return `../../assets/icons/phospor-icons/${iconMap[status]}-ph.svg`;
}

const getLogsFromStorage = async function () {
    let logs = await getStorageData('messageLogs');
    if (!logs) {
        await setStorageData('messageLogs', []);
        logs = [];
    }
    return logs;
}
const logs = await getLogsFromStorage();

const itemsPerPage = 5;
let currentPage = 1;
let endPage;

const toggleAfterDelay = (type, element, delay) => {
    if (!['display-none', 'log-single-active', 'log-single-details'].includes(type)) return;
    setTimeout(() => {
        element.classList.toggle(type);
        if (type === 'display-none') element.removeAttribute('style');
    }, delay);
};

const focusAfterDelay = (element, delay) => {
    setTimeout(() => {
        element.focus();
    }, delay);
}

const toggleExpandByIndex = (index) => {
    [...document.querySelectorAll('.log-single')].forEach((element, indexOnArray) => {
        if (indexOnArray === index) {
            element.classList.toggle('show-single-row');
            const currentWrapper = document.querySelector(`[data-details-index="${indexOnArray}"]`);
            const detailsText =  currentWrapper.querySelector('textarea.details-container');
            const detailsImage = currentWrapper.querySelector('img.details-container');
            const detailsLink = currentWrapper.querySelector('.details-link-container a');
            const detailsSpan = currentWrapper.querySelector('.details-link-container span');
            toggleAfterDelay('log-single-active', element, 900);
            focusAfterDelay(detailsText || detailsImage || detailsLink || detailsSpan, 900);
        } else {
            toggleAfterDelay('display-none', element, 700);
            element.classList.toggle('hide-single-row');
            if (element.classList.contains('hide-single-row')) {
                element.style.transition = `transform 700ms ease-out 0ms`;
            }
        }
    })
};

const getTextContentByType = (type, content) => {
    switch (type) {
        case 'text':
            return content.text;
        case 'link':
            return content.linkUrl;
        case 'page':
            return content.pageUrl;
        default:
            return false;
    }
}

const getLogDetailsByType = function (log, type, content) {
    if (!messageTypes.includes(type)) return;
    let html = '';
    if (log?.errorLog?.ok === false) {
        html += `<div class="details-container">
                    <div class="details-link-container">
                        <span tabindex="0">Error: </span><span tabindex="0">${log.errorLog.description.includes('wrong file identifier') ? 'Unsupported file type or header' : log.errorLog.description}</span>
                    </div>
                </div>`;
        return html;
    }
    switch (type) {
        case 'text':
            html += `<textarea aria-label="The text that was sent to Telegram" class="details-container" readonly contenteditable="false">${getTextContentByType(type, content)}</textarea>`;
            break;
        case 'page':
        case 'link':
            html += `<div class="details-container">
                        <div class="details-link-container">
                            <span>Link: </span><a aria-label="The link that was sent to Telegram" target="_blank" href="${getTextContentByType(type, content)}">${getTextContentByType(type, content)}</a>
                        </div>`;
            if (type === 'link') {
                html += `<div class="details-link-container">
                            <span>Source: </span><a aria-label="Source of the link" target="_blank" href="${content.tabUrl}">${content.tabUrl}</a>
                        </div>`;
            }
            html += `</div>`;
            break;
        case 'photo':
        case 'document':
            html += `<img loading="lazy" class="details-container sent-image display-none" src="${content.srcUrl}" alt="Image that was sent to Telegram" data-unique-id="${content.uniqueID}" tabindex="0">`;
            break;
    }
    return html;
}

const getLogDetailsFooter = function (tabUrl, logIndex) {
    return `<div class="details-footer">
                <div class="details-source-link">
                    <img src="${getLogTypeIcon('tabUrl')}" width="20" alt="Link icon">
                    <a aria-label="Source of the link" target="_blank" href="${tabUrl}">Source link</a>
                </div>
                <div class="details-delete-log">
                    <img src="${getLogTypeIcon('deleteLog')}" width="16" alt="Trash icon">
                    <a id="delete-log" data-log-index="${logIndex}" aria-label="Delete log" role="button" href="#" tabindex="0">Delete log</a>
                </div>
            </div>`;
}

const displayLogItems = function (page) {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    const logsContainer = document.querySelector('.logs-section');
    let logsHTML = '';

    if (logs.length === 0) {
        return logsContainer.innerHTML = `<div class="logs-list-empty">
            <img src="${getLogTypeIcon('noLogs')}" width="40">
            <p>Logs will appear here,<br> as you start sending messages!</p>
            </div>`;
    }

    for (let i = startIndex; i < endIndex && i < logs.length; i++) {
        const { type, content, timestamp, status} = logs[i];

        const modifiedType = type === 'document' ? 'photo' : type;
        logsHTML += `<div class="log-single${status === 'fail' ? ' failed-message-item' : ''}">
        <div class="log-single-heading">
            <div class="log-single-cell" aria-label="Message type">
                <div class="log-single-icon">
                    <img src="${getLogTypeIcon(type)}" width="25" alt="${type + ' icon'}" tabindex="0">
                </div>
                <div class="message-info">
                    <span class="message-type-text" tabindex="0">${modifiedType.charAt(0).toUpperCase() + modifiedType.slice(1)}</span>
                </div>
            </div>
            <div class="log-single-cell" aria-label="Message date">
                <div class="log-single-icon">
                    <img src="../../assets/icons/phospor-icons/calendar-blank-ph.svg" width="21" alt="Calendar icon">
                </div>
                <div class="message-date">
                    <span class="message-date-text" tabindex="0">${timestampToReadableDate(timestamp)}</span>
                </div>
            </div>
            <div class="log-single-cell" aria-label="Message status">
                <div class="log-single-icon message-status">
                    <img src="${getStatusIcon(status)}" width="${status === 'fail' ? 18 : 21}" alt="${status}" tabindex="0">
                </div>
            </div>
            <div class="log-single-cell">
                <div class="log-single-icon">
                    <i id="token-eye" class="expand-logs eyes-open" data-log-index="${i - ((page - 1) * itemsPerPage)}" data-log-type="${type}" data-expand="false" role="button" aria-label="Open log details" tabindex="0"></i>
                </div>
            </div> 
        </div>
        <div class="log-single-details display-none" data-details-index="${i - ((page - 1) * itemsPerPage)}">
            ${getLogDetailsByType(logs[i], type, content)}
            ${getLogDetailsFooter(content.tabUrl, i)}
        </div>
    </div>`;
    }

    logsContainer.innerHTML = logsHTML;

    document.querySelectorAll('.expand-logs').forEach(singleRow => {
        singleRow.addEventListener('click', async () => {
            const elementIndex = Number(singleRow.dataset.logIndex);
            const detailsContainer = document.querySelector(`[data-details-index="${elementIndex}"]`);
            const imgContainer = detailsContainer.querySelector('.sent-image');
            singleRow.classList.toggle('eyes-wide-shut');
            toggleAfterDelay('display-none', detailsContainer, 350);
            if (imgContainer) toggleAfterDelay('display-none', imgContainer, 150);
            toggleExpandByIndex(elementIndex);
            if (singleRow.getAttribute('aria-label') === 'Open log details') {
                singleRow.setAttribute('aria-label', 'Return to logs page');
            } else {
                singleRow.setAttribute('aria-label', 'Open log details');
            }
        });
        singleRow.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.keyCode === 13) {
                singleRow.click();
            }
        });
    });
    document.querySelectorAll('#delete-log').forEach(deleteLogButton => {
        deleteLogButton.addEventListener('click', async () => {
            const logIndex = Number(deleteLogButton.dataset.logIndex);
            logs.splice(logIndex, 1);
            await setStorageData('messageLogs', logs);
            await setStorageData('totalMessageCount', logs.length);
            const logContainersCount = document.querySelectorAll('.log-single').length;
            const newPageIndex  = currentPage === endPage && logContainersCount === 1 ? currentPage - 1 : currentPage;
            currentPage = newPageIndex;
            displayLogItems(newPageIndex);
            generatePagination();
        });
        deleteLogButton.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.keyCode === 13) {
                deleteLogButton.click();
            }
        });
    });
}

//generatePagination function was written by GPT-3.5
const generatePagination = function () {
    if (logs.length === 0) {
        return document.querySelector('.pagination').style.display = 'none';
    }

    const totalPages = Math.ceil(logs.length / itemsPerPage);
    const paginationContainer = document.querySelector('.pagination');
    paginationContainer.innerHTML = '';

    const prevButton = createPaginationButton('«', currentPage > 1, function () {
        if (currentPage > 1) {
            currentPage--;
            displayLogItems(currentPage);
            generatePagination();
        }
    });
    paginationContainer.appendChild(prevButton);

    // Calculate the range of visible page numbers (limit to 5)
    let startPage = Math.max(1, currentPage - 2);
    endPage = Math.min(startPage + (totalPages - currentPage > 2 ? 3 : 4), totalPages);

    for (let i = startPage; i <= endPage; i++) {
        const paginationLink = createPaginationButton(i, i !== currentPage, function () {
            currentPage = i;
            displayLogItems(currentPage);
            generatePagination();
        });

        if (i === currentPage) {
            paginationLink.setAttribute('aria-current', 'page');
            paginationLink.classList.toggle("active", i === currentPage);
        }

        paginationContainer.appendChild(paginationLink);
    }

    // Add "..." and last page button if necessary
    if (endPage < totalPages && totalPages - currentPage > 2) {
        paginationContainer.appendChild(createPaginationEllipsis());

        const lastPageButton = createPaginationButton(totalPages, true, function () {
            currentPage = totalPages;
            displayLogItems(currentPage);
            generatePagination();
        });
        paginationContainer.appendChild(lastPageButton);
    }

    const nextButton = createPaginationButton('»', currentPage < totalPages, function () {
        if (currentPage < totalPages) {
            currentPage++;
            displayLogItems(currentPage);
            generatePagination();
        }
    });
    paginationContainer.appendChild(nextButton);
}

const createPaginationButton = function (label, isEnabled, clickHandler) {
    const button = document.createElement('a');
    button.href = '#';
    button.textContent = label;
    button.setAttribute('role', 'button');
    const symbolMap = { '«': 'previous', '»': 'next' };
    const enOrdinalRules = new Intl.PluralRules("en-US", { type: "ordinal" });
    const suffixes = new Map([
        ["one", "st"],
        ["two", "nd"],
        ["few", "rd"],
        ["other", "th"],
    ]);
    const formatOrdinals = (n) => {
        const rule = enOrdinalRules.select(n);
        const suffix = suffixes.get(rule);
        return `${n}${suffix}`;
    };
    const modifiedLabel = Object.keys(symbolMap).includes(label) ? symbolMap[label] : `${formatOrdinals(label)}`;
    button.setAttribute('aria-label', `${isEnabled ? 'Go to' : ''} ${modifiedLabel} page`);
    button.setAttribute('aria-disabled', `${!isEnabled}`);
    button.className = isEnabled ? '' : 'pagination-disabled-button';
    button.addEventListener('click', clickHandler);
    if (isEnabled) {
        button.addEventListener('click', function () {
            document.querySelector('[aria-label="Message type"]:nth-child(1)').focus();
        });
    }
    return button;
}

const createPaginationEllipsis = function () {
    const ellipsis = document.createElement('a');
    ellipsis.href = '#';
    ellipsis.textContent = '..';
    ellipsis.setAttribute('aria-hidden', 'true');
    ellipsis.setAttribute('aria-disabled', 'true');
    ellipsis.setAttribute('aria-label', 'two dots');
    return ellipsis;
}

displayLogItems(currentPage);
generatePagination();
