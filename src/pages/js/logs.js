import { timestampToReadableDate } from '../../utils/date.js';
import { getStorageData, setStorageData } from '../../utils/storage.js';
import { messageTypes } from '../../utils/constants.js';
import { getIconPath } from '../../utils/getIconPath.js';

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
            const activeLogView = document.querySelector(`[data-details-index="${indexOnArray}"] .active-log-view`);
            toggleAfterDelay('log-single-active', element, 900);
            focusAfterDelay(activeLogView, 900);
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

const createLogDetailsElement = function (log, type, content) {
    if (!messageTypes.includes(type)) return;

    let modifiedType;
    switch (type) {
        case 'text':
            modifiedType = 'text';
            break;
        case 'link':
        case 'page':
            modifiedType = 'link';
            break;
        case 'photo':
        case 'document':
            modifiedType = 'photo';
            break;
    }
    const isErrorLog = log.errorLog && (log.errorLog.ok === false || Object.keys(log.errorLog).length === 0);
    if (isErrorLog) {
        modifiedType = 'error';
    }

    const template = document.querySelector(`#single-log-details-${modifiedType}-template`);
    const clone = template.content.cloneNode(true);

    let errorMsg;
    if (isErrorLog) {
        const errorMsgContainer = clone.querySelector('.error-message');
        if (!log.errorLog.description) {
            errorMsg = 'Unknown error';
        } else {
            errorMsg = log.errorLog.description.includes('wrong file identifier') ? 'Unsupported file type or header' : log.errorLog.description;
        }
        errorMsgContainer.textContent = errorMsg;
        return clone;
    }

    let textarea, link, sourceLink, img;

    switch (type) {
        case 'text':
            textarea = clone.querySelector('textarea');
            textarea.textContent = getTextContentByType(type, content);
            break;
        case 'page':
        case 'link':
            link = clone.querySelector('.details-link-container a.link');
            [link.href, link.textContent] = [getTextContentByType(type, content), getTextContentByType(type, content)];
            if (type === 'link' && content.tabUrl) {
                sourceLink = clone.querySelector('.details-link-container a.source');
                [sourceLink.href, sourceLink.textContent] = [content.tabUrl, content.tabUrl];
                clone.querySelector('.source-container').classList.remove('display-none');
            }
            break;
        case 'photo':
        case 'document':
            img = clone.querySelector('.sent-image');
            img.src = content.srcUrl;
            img.dataset.uniqueId = content.uniqueID;
            break;
    }

    return clone;
}

const getLogDetailsFooter = function (tabUrl, logIndex, type) {
    const template = document.querySelector('#single-log-details-footer-template');
    const clone = template.content.cloneNode(true);

    if (tabUrl && type !== 'page') {
        const linkIcon = clone.querySelector('.details-source-link img');
        linkIcon.src = getIconPath('tabUrl');

        const sourceLink = clone.querySelector('.details-source-link a');
        sourceLink.href = tabUrl;
    } else {
        const sourceLinkDiv = clone.querySelector('.details-source-link');
        sourceLinkDiv.remove();
    }

    const deleteLogIcon = clone.querySelector('.details-delete-log img');
    deleteLogIcon.src = getIconPath('deleteLog');

    const deleteLogBtn = clone.querySelector('.details-delete-log a');
    deleteLogBtn.dataset.logIndex = logIndex;

    return clone;
}

const displayLogItems = function (page) {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    const logsContainer = document.querySelector('.logs-section');

    const logElements = logsContainer.querySelectorAll('.log-single');

    logElements.forEach(element => {
        element.remove();
    });

    if (logs.length === 0) {
        const noLogsTemplate = document.querySelector('#no-logs-template');
        const noLogsDiv = noLogsTemplate.content.cloneNode(true);
        const noLogsIcon = noLogsDiv.querySelector('.no-logs-icon');
        noLogsIcon.src = getIconPath('noLogs');
        return logsContainer.appendChild(noLogsDiv);
    }

    for (let i = startIndex; i < endIndex && i < logs.length; i++) {

        const { type, content, timestamp, status, errorLog } = logs[i];
        const modifiedType = type === 'document' ? 'photo' : type;

        const logViewTemplate = document.querySelector('#single-log-view-template');
        const logView = logViewTemplate.content.cloneNode(true);

        const selectors = {
            logDiv: '.log-single',
            logViewIcon: '.content-type-icon',
            calendarIcon: '.calendar-icon',
            logViewType: '.message-type-text',
            logViewDate: '.message-date-text',
            logViewStatus: '.message-status img',
            logViewExpand: '.expand-logs',
            logViewDelete: '.delete-log',
            logViewDetails: '.log-single-details',
            logViewDetailsFooter: '.log-single-details .details-footer',
            logViewDetailsLink: '.log-single-details .details-link-container a',
            logViewDetailsDelete: '.log-single-details .details-delete-log a'
        };

        const elements = {};

        for (let key in selectors) {
            elements[key] = logView.querySelector(selectors[key]);
        }

        if (status === 'fail') {
            elements.logDiv.classList.add('failed-message-item');
        }

        [elements.logViewIcon.src, elements.logViewIcon.alt] = [getIconPath(modifiedType), `${type} icon`];
        elements.calendarIcon.src = getIconPath('calendar');

        elements.logViewType.textContent = modifiedType.charAt(0).toUpperCase() + modifiedType.slice(1);
        elements.logViewDate.textContent = timestampToReadableDate(timestamp);

        [elements.logViewStatus.src, elements.logViewStatus.width, elements.logViewStatus.alt] = [getIconPath(status), status === 'fail' ? 18 : 21, status];

        const isErrorLog = errorLog && (errorLog.ok === false || Object.keys(errorLog).length === 0);

        if (!content && !isErrorLog) {
            elements.logViewExpand.src = getIconPath('eye-slash');
            elements.logViewExpand.classList.add('no-log-details', 'no-button-hover');
            elements.logViewExpand.role = 'img'
            elements.logViewExpand.setAttribute('aria-label', 'Based on your log settings, no log details were saved for this message.');
        } else {
            [elements.logViewExpand.dataset.logIndex, elements.logViewExpand.dataset.logType] = [i - ((page - 1) * itemsPerPage), type];
        }

        elements.logViewDelete.dataset.logIndex = i;

        elements.logViewDetails.dataset.detailsIndex = i - ((page - 1) * itemsPerPage);
        elements.logViewDetails.appendChild(createLogDetailsElement(logs[i], type, content));
        elements.logViewDetails.appendChild(getLogDetailsFooter(content.tabUrl, i, type));

        logsContainer.appendChild(logView);
    }

    document.querySelectorAll('.expand-log-icon:not(:has(.no-log-details)) .expand-logs').forEach(singleRow => {
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
    while (paginationContainer.firstChild) {
        paginationContainer.removeChild(paginationContainer.firstChild);
    }

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

        if (totalPages !== 5) {
            paginationContainer.appendChild(createPaginationEllipsis());
        }

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
