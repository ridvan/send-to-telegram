//written by GPT-3.5
const timestampToReadableDate = function(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
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
    if(!['text', 'image'].includes(type)) return false;

    const iconMap = {
        'text': 'article',
        'image': 'image'
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

const logsArray = [
    {
        type: 'text',
        content: 'Lorem ipsum dolor sit amet',
        timestamp: '1692523410',
        status: 'success'
    },
    {
        type: 'image',
        content: 'https://picsum.photos/200',
        timestamp: '1692522410',
        status: 'fail'
    },
    {
        type: 'text',
        content: 'Lorem ipsum dolor sit amet',
        timestamp: '1692521410',
        status: 'success'
    },
    {
        type: 'image',
        content: 'https://picsum.photos/200',
        timestamp: '1692520410',
        status: 'fail'
    },
    {
        type: 'text',
        content: 'Lorem ipsum dolor sit amet',
        timestamp: '1692513410',
        status: 'success'
    },
    {
        type: 'image',
        content: 'https://picsum.photos/200',
        timestamp: '1692503410',
        status: 'fail'
    },
    {
        type: 'text',
        content: 'Lorem ipsum dolor sit amet',
        timestamp: '1692423410',
        status: 'success'
    },
    {
        type: 'image',
        content: 'https://picsum.photos/200',
        timestamp: '1692323410',
        status: 'fail'
    },
    {
        type: 'text',
        content: 'Lorem ipsum dolor sit amet',
        timestamp: '1692223410',
        status: 'success'
    },
    {
        type: 'image',
        content: 'https://picsum.photos/200',
        timestamp: '1692043410',
        status: 'fail'
    }
];

const itemsPerPage = 5;
let currentPage = 1;

const displayLogItems = function(page) {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    const logsContainer = document.querySelector('.logs-section');
    let logsHTML = '';

    for (let i = startIndex; i < endIndex && i < logsArray.length; i++) {
        const { type, content, timestamp, status} = logsArray[i];
        console.log(status);
        logsHTML += `<div class="log-single">
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

const generatePagination = function() {
    const totalPages = Math.ceil(logsArray.length / itemsPerPage);
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

    for (let i = 1; i <= totalPages; i++) {
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
