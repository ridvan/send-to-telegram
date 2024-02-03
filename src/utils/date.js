// timestampToReadableDate function was written by GPT-3.5, I updated it afterward
export const timestampToReadableDate = function (unixTimestamp) {
    const date = new Date(unixTimestamp);
    return `${date.toLocaleString('en-US', { month: 'short' })} 
    ${date.getDate()}, ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
};
