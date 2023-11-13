export const getStorageDataByKey = async function(key) {
    const data = await chrome.storage.local.get([key]);
    return data[key];
}
