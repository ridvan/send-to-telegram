// timestampToReadableDate function was written by GPT-3.5
export const timestampToReadableDate = function(unixTimestamp) {
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
