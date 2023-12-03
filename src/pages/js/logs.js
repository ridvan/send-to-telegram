import { timestampToReadableDate } from '../../utils.js';
import { getStorageData, setStorageData } from '../../handlers/storage.js';
import { messageTypes } from "../../options.js";

const getLogTypeIcon = function (type) {
    if(!['text', 'photo', 'page', 'link', 'noLogs'].includes(type)) return false;

    const iconMap = {
        'text': 'text-aa',
        'photo': 'image',
        'page': 'article',
        'link': 'link-simple',
        'noLogs': 'paper-plane-tilt-duotone'
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

const toggleAfterDelay = (type, element, delay) => {
    if (!['display-none', 'log-single-active', 'log-single-details'].includes(type)) return;
    setTimeout(() => {
        element.classList.toggle(type);
        if (type === 'display-none') element.removeAttribute('style');
    }, delay);
};

const toggleExpandByIndex = (index) => {
    [...document.querySelectorAll('.log-single')].forEach((element, indexOnArray) => {
        if (indexOnArray === index) {
            element.classList.toggle('show-single-row');
            toggleAfterDelay('log-single-active', element, 900);
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
    switch (type) {
        case 'text':
            html += `<textarea class="details-container" readonly contenteditable="false">${getTextContentByType(type, content)}</textarea>`;
            break;
        case 'page':
        case 'link':
            html += `<div class="details-container">
                        <div class="details-link-container">
                            <span>Link: </span><a target="_blank" href="${getTextContentByType(type, content)}">${getTextContentByType(type, content)}</a>
                        </div>`;
            if (type === 'link') {
                html += `<div class="details-link-container">
                            <span>Source: </span><a target="_blank" href="${content.tabUrl}">${content.tabUrl}</a>
                        </div>`;
            }
            html += `</div>`;
            break;
        case 'photo':
            html += `<img loading="lazy" class="details-container" src="${content.srcUrl}" alt="Image that was sent to Telegram" data-unique-id="${content.uniqueID}">`;
            break;
    }
    return html;
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

        logsHTML += `<div class="log-single${status === 'fail' ? ' failed-message-item' : ''}">
        <div class="log-single-heading">
            <div class="log-single-cell">
                <div class="log-single-icon">
                    <img src="${getLogTypeIcon(type)}" width="25">
                </div>
                <div class="message-info">
                    <span class="message-type-text">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </div>
            </div>
            <div class="log-single-cell">
                <div class="log-single-icon">
                    <img src="../../assets/icons/phospor-icons/calendar-blank-ph.svg" width="21">
                </div>
                <div class="message-date">
                    <span class="message-date-text">${timestampToReadableDate(timestamp)}</span>
                </div>
            </div>
            <div class="log-single-cell">
                <div class="log-single-icon message-status">
                    <img src="${getStatusIcon(status)}" width="${status === 'fail' ? 18 : 21}">
                </div>
            </div>
            <div class="log-single-cell">
                <div class="log-single-icon">
                    <i id="token-eye" class="expand-logs eyes-open" data-log-index="${i - ((page - 1) * itemsPerPage)}" data-log-type="${type}" data-expand="false"></i>
                </div>
            </div> 
        </div>
        <div class="log-single-details display-none" data-details-index="${i - ((page - 1) * itemsPerPage)}">
            ${getLogDetailsByType(logs[i], type, content)}
        </div>
    </div>`;
    }

    logsContainer.innerHTML = logsHTML;

    document.querySelectorAll('.expand-logs').forEach(singleRow => {
        singleRow.addEventListener('click', async () => {
            const elementIndex = Number(singleRow.dataset.logIndex);
            const detailsContainer = document.querySelector(`[data-details-index="${elementIndex}"]`);
            singleRow.classList.toggle('eyes-wide-shut');
            toggleAfterDelay('display-none', detailsContainer, 350);
            toggleExpandByIndex(elementIndex);
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
    paginationContainer.innerHTML = "";

    const prevButton = document.createElement("a");
    prevButton.textContent = "«";
    prevButton.href = "#";
    if (currentPage === 1) prevButton.className = 'pagination-disabled-button';
    prevButton.addEventListener("click", function () {
        if (currentPage > 1) {
            currentPage--;
            displayLogItems(currentPage);
            generatePagination();
        }
    });
    paginationContainer.appendChild(prevButton);

    // Calculate the range of visible page numbers (limit to 5)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(startPage + (totalPages - currentPage > 2 ? 3 : 4), totalPages);

    for (let i = startPage; i <= endPage; i++) {
        const paginationLink = document.createElement("a");
        paginationLink.href = "#";
        paginationLink.textContent = i;
        paginationLink.classList.toggle("active", i === currentPage);

        paginationLink.addEventListener("click", function () {
            currentPage = i;
            displayLogItems(currentPage);
            generatePagination();
        });

        paginationContainer.appendChild(paginationLink);
    }

    // Add "..." and last page button if necessary
    if (endPage < totalPages && totalPages - currentPage > 2) {
        const ellipsis = document.createElement("a");
        ellipsis.href = "#";
        ellipsis.textContent = "..";
        paginationContainer.appendChild(ellipsis);

        const lastPageButton = document.createElement("a");
        lastPageButton.href = "#";
        lastPageButton.textContent = totalPages;
        lastPageButton.addEventListener("click", function () {
            currentPage = totalPages;
            displayLogItems(currentPage);
            generatePagination();
        });
        paginationContainer.appendChild(lastPageButton);
    }

    const nextButton = document.createElement("a");
    nextButton.textContent = "»";
    nextButton.href = "#";
    if (currentPage === totalPages) nextButton.className = 'pagination-disabled-button';
    nextButton.addEventListener("click", function () {
        if (currentPage < totalPages) {
            currentPage++;
            displayLogItems(currentPage);
            generatePagination();
        }
    });
    paginationContainer.appendChild(nextButton);
}

displayLogItems(currentPage);
generatePagination();
