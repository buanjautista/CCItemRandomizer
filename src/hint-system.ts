import { fixedRandomInt, fixedRandomNumber, readJsonFromFile } from './utils.js';
import { Check } from './checks.js';

type LoreOverrides = Record<string, Record<string, [{ path: string; index: number }]>>
export let loreMapReplacements: LoreOverrides

let spoilerLog: any // This might get replaced with anything on the main script
let currentSeed: any = 0 // this will probably get replaced with "seed2" on implementation
let seedIndex: any = 0

export function saveSpoilerSeed(spoiler: any, seed: any) {
    spoilerLog = spoiler
    currentSeed = seed
}

export function generateHintList() {
    for (let i = 0; i < getHintListLength(); i++) {
        generateHint()
    }
}

// Gets the info from randomizerState, and returns the spoiler log from it
// Later on it might be better to just grab the spoiler log before it turns into JSON, inside the generate.ts 
async function grabSpoilerLog() { 
    const response = await fetch('/randomizerState.json');
    const spoiler = await response.json();
 
    spoilerLog = spoiler.spoilerLog
    currentSeed = spoiler.seed.slice(2).split('_')[0]   

    spoilerLog = spoilerLog

    return spoilerLog
}


export async function generateHint() { // outputs a random hint phrase from spoiler log information
    let spoiler
    spoilerLog ? spoiler = spoilerLog  : spoiler = await grabSpoilerLog()

    let item
    let usefulItemList = getUsefulItemList(spoiler)    

    let randomChance = fixedRandomNumber(getCurrentSeedWithOffset()) < 0.4 // Random chance to get a random item or just a useful item spoiler
    randomChance 
        ? item = getRandomItem(usefulItemList)
        : item = getRandomItem(spoiler)
    

    // Extra checks for item type, in case its not a chest item, replaces map location info and key lock info
    let currentItemMap
    let currentItemLock 
    
    switch (item.type) {
        case "shop":
            currentItemMap = "a certain shop"
            currentItemLock = "not in a chest"
            break
        case "element":
            currentItemMap = item.map
            currentItemLock = "is locked in a element room"
            break
        default:
        case "chest":
            currentItemMap = item.map
            currentItemLock = item.chestType
            break   
    }

    // Generates hint
    let hintInfo = await getHintOutput(item, currentItemMap, currentItemLock, usefulItemList)

    hintList.push({hint: hintInfo[0], type: hintInfo[1]}) // Get the hints on a list to be injected into the game later

    return hintInfo
}


// goes through the entire spoiler log grabbing the useful items, matching with USEFUL_ITEMS list
function getUsefulItemList(spoiler: any) { 
    let itemList = []
    for(let i = 0; i < spoiler.length; i++) {
        if (isUsefulItem(spoiler[i].replacedWith.item)) {
            itemList.push(spoiler[i])
        }
    }
    return itemList
}
function getUsefulItemMaps(itemList: any) {
    let usefulMapList = []
    for (let i = 0; i < itemList.length; i++) {
        usefulMapList.push(itemList[i].map)
    }
    return usefulMapList
}

// Gets a random item from the list of the full/usefulitem spoiler log 
function getRandomItem(spoiler: any) {
    let randomNum = fixedRandomInt(getCurrentSeedWithOffset(),0,spoiler.length)
    let item = spoiler[randomNum]

    return item
}

// Throws the area name based on the item's map
function getArea(currentMap: any){
    let areaInfo = currentMap.split(".");
    areaInfo = areaInfo[0]

    switch (areaInfo) { // workaround for weird area name cases
        case "heat":
            areaInfo = "heat-area"
            break
        case "autumn":
            areaInfo = "autumn-area"
            break
        case "bergentrail":
            areaInfo = "bergen-trails"
            break
        default:
            break
    }

    if (sc.map.areas[areaInfo]) {
        areaInfo = sc.map.areas[areaInfo].name["en_US"] // add a fix later on to match game language maybe
    }
    return areaInfo
}

async function getHintOutput(item: any, currentItemMap: string, currentItemLock: any, usefulItemList: any) {
    let outputSpoiler

    let usefulMapList = getUsefulItemMaps(usefulItemList)

    // Generates random sentences
    let randomOKSentence = getRandomPhrase(connectorStrings.usefulconnector)
    let randomEmptySentence = [getRandomPhrase(connectorStrings.emptylocations[0]), getRandomPhrase(connectorStrings.emptylocations[1])]
    let randomLockSentence = [getRandomPhrase(connectorStrings.lockedconnector[0]), getRandomPhrase(connectorStrings.lockedconnector[1])]
    let randomKeySentence = [getRandomPhrase(connectorStrings.keylocations[0]), getRandomPhrase(connectorStrings.keylocations[1])]
    
    // Random chances to get a key lock, an area info, or a useless sentence
    let doLockSentence = fixedRandomNumber(getCurrentSeedWithOffset()) < 0.3
    let doUselessSentence = fixedRandomNumber(getCurrentSeedWithOffset()) < 0.05
    let doAreaSentence = fixedRandomNumber(getCurrentSeedWithOffset()) < 0.6
    let doMapSentence = fixedRandomNumber(getCurrentSeedWithOffset()) < 0.4

    // Generates the entire hint phrase depending on the item, and sentences chances
    let currentItemID = item.replacedWith.item

    let hintType

    let currentMap = await getMapName(item)


    if (doUselessSentence) { // lovely system to throw out a useful hint entirely
        outputSpoiler = getRandomPhrase(connectorStrings.uselessphrases)
        hintType = "Item Hint"
    }

    else {
        if (isUsefulItem(currentItemID)) {
            // Have a chance to replace the chest's map, with chest's area 
            if (doLockSentence && item.type == "chest") { // adds a check to show a key-lock hint 
                hintType = "Lock Type Hint"
                if (currentItemLock == "Default") { outputSpoiler = (getItemInfo(currentItemID) + " chest is not key locked") }
                else { outputSpoiler = (getItemInfo(currentItemID) + " " +  randomLockSentence[0] + " " + currentItemLock + " " + randomLockSentence[1]) }
            }
            else { // otherwise throws a regular hint
                hintType = "Item Hint"
                if (doAreaSentence) {
                    hintType = "Location Hint"
                    currentItemMap = getArea(currentItemMap)
                }
                outputSpoiler = (getItemInfo(currentItemID) + " " +  randomOKSentence + " " + currentMap)
            }
        }
        // throw a sentence that has info on a certain map
        else if (doMapSentence && (item.type == "chest" || item.type == "event")) {
            hintType = "Location Hint"
            if (usefulMapList.includes(currentItemMap)) {
                outputSpoiler = (currentMap + " " + randomKeySentence[0])
            }
            else {
                outputSpoiler = (currentMap + " " + randomKeySentence[1])
            }
        }
        // if the check is not a useful item just throw a empty location sentence
        else { 
                outputSpoiler = (randomEmptySentence[0] + currentMap + " " +  randomEmptySentence[1]) 
                hintType = "Location Hint"
        }
    }

    return [outputSpoiler, hintType]
}

// gets the item's name
function getItemInfo(item: any) {
    return ig.vars.get("item." + item + ".name")
}


// grabs the item ID and matches it with the useful_items array
const USEFUL_ITEMS = [145,149,170,154,155,156,225,153,236,376,147,230,345,286,231,410,439,434,350, 152,146,272,319,349]
function isUsefulItem(currentItem: any) { 
    let isUseful
    for (let i = 0; i < USEFUL_ITEMS.length; i++ ){
        if (currentItem == USEFUL_ITEMS[i]) {
            return isUseful = true
        }
    }
    return isUseful = false
}

// just slaps a random phrase from the string dict
function getRandomPhrase (obj: any) {
    let randomstring = obj[fixedRandomInt(getCurrentSeedWithOffset(),0,obj.length)]
    return randomstring
}
var connectorStrings = { // a dictionary for phrase variance
    usefulconnector: ["is located in", "can be found in", "is somewhere in", "is hidden behind"],
    lockedconnector: [["is locked by a", "is hidden behind a"], ["key", "lock", "chest"]],
    emptylocations: [["A pickup in ", "A check in ", "One of the chests in ", "Something under "],
    ["has no important items", "might not have anything important", "is not a key item", "might have nothing", "is not relevant"]],
    uselessphrases: ["Thanks for playing rando", "A hint was here but someone stole it", "Insert awful phrases to fill hint space", "Did you know worms have five hearts? Just like real earth worms do", "Sponsored by Project Terra unwalkable fences", "Year of the Crosscode", "JADC stands for Jump Attack Dash Cancel", "There is Just Water in Bergen", "Star Shade is located in Master Sword pedestal"],
    keylocations: [["has an important item", "has a key item", "holds something useful", "yields a key item", "might be worth visiting", "might have what you're looking for"],["has no key items", "is dry on pickups","is an empty location", "might be empty", "is completely void of key items","might not have what you're looking for"]]
}

// A cheap function to get the same hint values on a specific seed
function getCurrentSeedWithOffset() {
    let seedOffset = currentSeed + seedIndex
    seedIndex++
    return seedOffset
}


// Returns hint info from a specific entry on the list, to inject in the game
export function getHintListEntry(index: any) {
    if (hintList && hintList[index])
    {
        return {
            event: [{
                "text": {
                    "en_US": hintList[index].hint,
                    "de_DE": hintList[index].hint,
                    "fr_FR": hintList[index].hint,
                    "zh_CN": hintList[index].hint,
                    "ja_JP": hintList[index].hint,
                    "ko_KR": hintList[index].hint,
                    "langUid": 64,
                    "zh_TW": hintList[index].hint
                },
                "center": false,
                "type": "SHOW_BOARD_MSG"
            }],
            hover: {
                    "en_US": hintList[index].type,
                    "de_DE": hintList[index].type,
                    "fr_FR": hintList[index].type,
                    "langUid": 63,
                    "zh_CN": hintList[index].type,
                    "ja_JP": hintList[index].type,
                    "ko_KR": hintList[index].type,
                    "zh_TW": hintList[index].type
            }
        }
    }
    else {
        return { 
            event: [{
                "text": {
                    "en_US": "Missing Hint",
                    "de_DE": "Missing Hint",
                    "fr_FR": "Missing Hint",
                    "zh_CN": "Missing Hint",
                    "ja_JP": "Missing Hint",
                    "ko_KR": "Missing Hint",
                    "langUid": 64,
                    "zh_TW": "Missing Hint"
                },
                "center": false,
                "type": "SHOW_BOARD_MSG"
            }],
            hover: {
                    "en_US": "Missing Hint",
                    "de_DE": "Missing Hint",
                    "fr_FR": "Missing Hint",
                    "langUid": 63,
                    "zh_CN": "Missing Hint",
                    "ja_JP": "Missing Hint",
                    "ko_KR": "Missing Hint",
                    "zh_TW": "Missing Hint"
            }
        }
    }
}

function getHintListLength (){
    let listLength = 0
    for (let maps of Object.values(loreMapReplacements)) {
        listLength += Object.keys(maps).length
    }
    return listLength
}

let hintList: any = []

export async function setLoreOverrides(directory: any) {
    loreMapReplacements = await readJsonFromFile(directory + "data/lore-replacements.json");
}


// find a way to refer to generateRandomizerState.getPrettyName and just do everything with that function instead
async function getMapName(log: Check) {
    const database = await readJsonFromFile('assets/data/database.json');
    const shopsDatabase = database.shops;

    if (log.type === 'shop') {
        return shopsDatabase[log.name].name.en_US;
    }

    if ('name' in log) {
        return log.name; //TODO: quest names
    }

    let fullMapName = log.mapName.split(/\-/g);
    let mapName = fullMapName[1].slice(1)
    
    return mapName;
}