import { setStorageData } from '../../utils/storage.js';

const selectById = id => document.getElementById(id);
const getCurrentStep = () => Number(document.querySelector('.wizard-welcome').dataset.wizardStep);

const updateWizardSections = function ({ heading, button }) {
    const step = getCurrentStep();
    selectById('wizard-heading').innerText = heading;
    document.querySelector('#wizard-content div:not(.display-none)').classList.toggle('display-none'),
    document.querySelector(`.content-part-${step}`).classList.toggle('display-none'),
    selectById('wizard-button-text').innerText = button;
};

const wizardStepHandler = async function () {
    const step = getCurrentStep();
    switch (step) {
        case 2:
            updateWizardSections({
                heading: 'First things first...',
                button: 'I got the token!'
            });
            break;
        case 3:
            updateWizardSections({
                heading:  'Every good chat...',
                button: 'That was easy!'
            });
            break;
        case 4:
            updateWizardSections({
                heading: 'Almost there... 🏁',
                button: 'Bring me to Settings Page!'
            });
            break;
        case 5:
            await hideTheWizard();
            window.location.replace('/pages/settings.html');
            break;
        default:
            return false;
    }
};

const hideTheWizard = async function () {
    const isChecked = selectById('hide-wizard').checked;
    await setStorageData('hideWizard', isChecked);
};

document.querySelector('#wizard-button').addEventListener('click', async function (e) {
    e.preventDefault();
    window.parent.postMessage('resize', '*');
    document.querySelector('.wizard-welcome').dataset.wizardStep = `${getCurrentStep() + 1}`;
    await wizardStepHandler();
    selectById('wizard-heading').focus();
});
