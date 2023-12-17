export const getStorageData = async function (key) {
    const data = await chrome.storage.local.get([key]);
    return data[key];
}

export const setStorageData = async function (key, value) {
    await chrome.storage.local.set({[key]: value});
}
