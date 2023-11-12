// timestampToReadableDate function was written by GPT-3.5
const timestampToReadableDate = function(unixTimestamp) {
    const date = new Date(unixTimestamp);
    const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${month} ${day}, ${hours}:${minutes.toString().padStart(2, '0')}`;
}

const getLogTypeIcon = function(type) {
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

const getStatusIcon = function(status) {
    if(!['success', 'fail'].includes(status)) return false;

    const iconMap = {
        'success': 'checks',
        'fail': 'x'
    };

    return `../../assets/icons/phospor-icons/${iconMap[status]}-ph.svg`;
}

const getLogsFromStorage = async function() {
    let { messageLogs: logs } = await chrome.storage.local.get('messageLogs');
    if (!logs) {
        await chrome.storage.local.set({'messageLogs': []})
        logs = [];
    }
    return logs;
}
const logs = await getLogsFromStorage();

const itemsPerPage = 5;
let currentPage = 1;

const displayLogItems = function(page) {
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
    </div>`;
    }

    logsContainer.innerHTML = logsHTML;

}

//generatePagination function was written by GPT-3.5
const generatePagination = function() {
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
    prevButton.addEventListener("click", function() {
        if (currentPage > 1) {
            currentPage--;
            displayLogItems(currentPage);
            generatePagination();
        }
    });
    paginationContainer.appendChild(prevButton);

    // Calculate the range of visible page numbers (limit to 5)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(startPage + 4, totalPages);

    for (let i = startPage; i <= endPage; i++) {
        const paginationLink = document.createElement("a");
        paginationLink.href = "#";
        paginationLink.textContent = i;
        paginationLink.classList.toggle("active", i === currentPage);

        paginationLink.addEventListener("click", function() {
            currentPage = i;
            displayLogItems(currentPage);
            generatePagination();
        });

        paginationContainer.appendChild(paginationLink);
    }

    const nextButton = document.createElement("a");
    nextButton.textContent = "»";
    nextButton.href = "#";
    if (currentPage === totalPages) nextButton.className = 'pagination-disabled-button';
    nextButton.addEventListener("click", function() {
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
