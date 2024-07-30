const { execSync } = require('child_process');
const fs = require('node:fs');
const { Builder, Browser, By, Key, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');

const UPDATED_FILENAME = 'last-updated.log';
const LOG_FILENAME = 'last-run.log';
const LOGS = [];
const SETTINGS_FILENAME = 'domain-settings.txt';

const FORPSI_USERNAME = '';
const FORPSI_PASSWORD = '';
const FORPSI_DOMAINS = [];

process.on('uncaughtException', function(error) {
    handleError(error);
});

checkUpdate();

// FUNCTIONS

async function checkUpdate() {
    try {
        addLog('Timestamp: ' + new Date().toLocaleString());

        const publicIpAddress = getPublicIpAddress();
        addLog('Current Public IP Address: ' + publicIpAddress);

        let domainSettings = getDomainSettings();
        addLog(domainSettings);

        let anyUpdated = false;

        for (let domain of FORPSI_DOMAINS) {
            if (!domain.enabled) {
                continue;
            }

            if (!domainSettings[domain.name]
                || !domainSettings[domain.name].ipAddress
                || domainSettings[domain.name].ipAddress !== publicIpAddress) {

                await updateDomain(domain.editPage, publicIpAddress);

                addLog('DOMAIN UPDATED: ' + domain.name);

                domainSettings[domain.name] = {
                    ipAddress: publicIpAddress
                };

                anyUpdated = true;
            }
        }

        if (anyUpdated) {
            updateDomainSettings(domainSettings);
            saveLogs(true);
        } else {
            addLog('NO UPDATE NEEDED');
            saveLogs(false);
        }
    }
    catch (error) {
        handleError(error);
    }
}

function getPublicIpAddress() {
    const publicIpAddress = (execSync('dig +short myip.opendns.com @resolver1.opendns.com') || '').toString().trim();

    if (!publicIpAddress) {
        handleError('No Public IP Address found');
    }

    return publicIpAddress;
}

function getDomainSettings() {
    if (fs.existsSync(__dirname + '/' + SETTINGS_FILENAME)) {
        const data = fs.readFileSync(__dirname + '/' + SETTINGS_FILENAME, 'utf8');
        return JSON.parse(data);
    } else {
        return {};
    }
}

async function updateDomain(editPage, ipAddress) {
    try {
        const driver = await new Builder()
            .forBrowser(Browser.FIREFOX)
            .setFirefoxOptions(new firefox.Options().addArguments('--headless').windowSize({width: 1920, height: 1080}))
            .build();

        await driver.get(editPage);

        await driver.findElement(By.css('input#user_name')).sendKeys(FORPSI_USERNAME);
        await driver.findElement(By.css('input#password')).sendKeys(FORPSI_PASSWORD, Key.RETURN);

        await driver.wait(until.elementLocated(By.css('table.table_general')), 30000);

        const rows = await driver.findElements(By.css("table.table_general > tbody > tr.editable"));

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const domainType = await (await row.findElement(By.css("td:nth-child(3)"))).getText();
            if (domainType === 'A') {
                (await row.findElement(By.css("a.edit_row"))).click();
                break;
            }
        }

        await driver.sleep(2000);

        const ipAddressInput = await driver.findElement(By.css('div#record-edit_body table > tr:nth-child(2) textarea#rdata'));
        await ipAddressInput.clear();
        await ipAddressInput.sendKeys(ipAddress);
        (await driver.findElement(By.css('div#record-edit_body input[value="ment"]'))).click();

        await driver.wait(until.elementLocated(By.css(`table.table_general > tbody > tr.editable > td:nth-child(4)[title="${ipAddress}"]`)), 30000);

        await driver.quit();
    }
    catch (error) {
        await driver.quit();
        handleError(error);
    }
}

function updateDomainSettings(domainSettings) {
    fs.writeFileSync(__dirname + '/' + SETTINGS_FILENAME, JSON.stringify(domainSettings));
}

function handleError(error) {
    addLog(error.message || error);
    saveLogs(false);
    process.exit(1);
}

function addLog(message) {
    LOGS.push(message);
    console.log(message);
}

function saveLogs(updated) {
    const content = LOGS
        .map(log => typeof log === 'string' ? log : JSON.stringify(log))
        .join('\n') + '\n';

    fs.writeFileSync(__dirname + '/' + LOG_FILENAME, content);

    if (updated) {
        fs.writeFileSync(__dirname + '/' + UPDATED_FILENAME, content);
    }
}
