import { fixedRandomInt, fixedRandomNumber, readJsonFromFile } from './utils.js';
import { Check } from './checks.js';

interface LoreMap {
    [mapId: string]: { path: string, index: number }
}
interface LoreOverrides { 
    [mapName: string]: LoreMap 
}

export let loreMapReplacements: LoreOverrides

// @ts-ignore
const fs: typeof import('fs') = require('fs');
// @ts-ignore
declare const ig: any;
// @ts-ignore
declare const sc: any;

let spoilerLog: any // This might get replaced with anything on the main script
let currentSeed: any = 0 // this will probably get replaced with "seed2" on implementation
let shorterSeed: number
let seedIndex: any = 0

export function saveSpoilerSeed(spoiler: any, seed: any) {
    spoilerLog = spoiler
    currentSeed = seed
}

async function fetchHintList(): Promise<any> {
    let list
    let listExists = fs.existsSync('randomizerHints.json');
    if (listExists) {
        list = await readJsonFromFile('randomizerHints.json')
        if (currentSeed == list.seed) {
            let savedHintList = list.hints
            return savedHintList
        }
        else {
            return false
        }
    }
    return false
}

export async function generateHintList() {
    let savedHintList = await fetchHintList()
    hintList = []
    if (savedHintList == false) {
        let hintCount = await getHintListLength()
        for (let i = 0; i < hintCount; i++) {
            let hintInfo = await generateHint()
            hintList.push({hint: hintInfo[0], type: hintInfo[1]})
        }
        fs.promises.writeFile(
            'randomizerHints.json',
            JSON.stringify({ "seed": currentSeed, "hints": hintList }),
        );
    }
    else { 
        hintList = savedHintList
    }
    // console.log("Hints generated: ", hintCount, hintList) 
}

// Gets the info from randomizerState, and returns the spoiler log from it
// Later on it might be better to just grab the spoiler log before it turns into JSON, inside the generate.ts 
async function grabSpoilerLog() { 
    const response = await fetch('/randomizerState.json');
    const spoiler = await response.json();
 
    spoilerLog = spoiler.spoilerLog
    currentSeed = spoiler.seed
    shorterSeed = currentSeed.slice(2).split('_')[0]   

    spoilerLog = spoilerLog

    return spoilerLog
}


export async function generateHint() { // outputs a random hint phrase from spoiler log information
    let spoiler
    spoilerLog ? spoiler = spoilerLog  : spoiler = await grabSpoilerLog()

    let item
    let usefulItemList = getUsefulItemList(spoiler)    

    let randomChance = randomSeededChance(0.4) // Random chance to get a random item or just a useful item spoiler
    randomChance 
        ? item = getRandomItem(usefulItemList)
        : item = getRandomItem(spoiler)
    
    // Extra checks for item type, in case its not a chest item, replaces map location info and key lock info
    let currentItemMap
    let currentItemLock 
    
    // Throws a specific hint depending if item is on shop or element room
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

async function getHintOutput(item: any, currentItemMap: string, currentItemLock: any, usefulItemList: any) {
    let hintType
    let outputSpoiler
    let { randomEmptySentence, randomBadSentence, randomOKSentence, randomLockSentence, randomKeySentence } = generateSentences();
    let { doLockSentence, doUselessSentence, doAreaSentence, doMapSentence } = generateSentenceChances();

    let usefulMapList = getUsefulItemMaps(usefulItemList);
    // Generates the entire hint phrase depending on the item, and sentences chances
    let currentMapName = await getMapName(item);
    let currentItemID = item.replacedWith.item;

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
                    currentMapName = getArea(currentItemMap)
                }
                outputSpoiler = (getItemInfo(currentItemID) + " " +  randomOKSentence + " " + currentMapName)
            }
        }

        // throw a sentence that has info on a certain map
        else if (doMapSentence && (item.type == "chest" || item.type == "event")) {
            hintType = "Location Hint"
            if (usefulMapList.includes(currentItemMap)) {
                outputSpoiler = (currentMapName + " " + randomKeySentence[0])
            }
            else {
                outputSpoiler = (currentMapName + " " + randomKeySentence[1])
            }
        }

        // if the check is not a useful item just throw a empty location sentence
        else { 
            if (checkMapEmpty(currentItemMap) && randomSeededChance(0.3)) { // check if completely empty location
                if (doAreaSentence) {
                    hintType = "Location Hint"
                    currentMapName = getArea(currentItemMap)
                }
                outputSpoiler = (currentMapName + " " +  randomEmptySentence) 
                hintType = "Location Hint"
            }
            else { // otherwise sends a vague info
                outputSpoiler = (randomBadSentence[0] + currentMapName + " " +  randomBadSentence[1]) 
                hintType = "Location Hint"
            }
        }
    }

    return [outputSpoiler, hintType]
}

function checkMapEmpty(map: any) {
    for (let check of spoilerLog) {
        if (check.map == map) {
            if (isUsefulItem(check.replacedWith.item)) { return false; }
        }
    }
    return true
}

// just slaps a random phrase from the string dict
function getRandomPhrase (obj: any) {
    let randomstring = obj[fixedRandomInt(getCurrentSeedWithOffset(),0,obj.length)]
    return randomstring
}
var connectorStrings = { // a dictionary for phrase variance
    usefulconnector: ["is located in", "can be found in", "is somewhere in", "is hidden behind"],
    lockedconnector: [["is locked by a", "is hidden behind a"], ["key", "lock", "chest"]],
    badlocations: [["A pickup in ", "A check in ", "One of the chests in ", "Something under "],
    ["has no important items", "might not have anything important", "is not a key item", "might have nothing", "is not relevant"]],
    emptylocations: ["has no important items", "is barren", "has no key items", "is not relevant"],
    uselessphrases: ["Thanks for playing rando", "A hint was here but someone stole it", "Insert awful phrases to fill hint space", "Did you know worms have five hearts? Just like real earth worms do", "Sponsored by Project Terra unwalkable fences", "Year of the Crosscode", "JADC stands for Jump Attack Dash Cancel", "There is Just Water in Bergen", "Star Shade is located in Master Sword pedestal"],
    keylocations: [["has an important item", "has a key item", "holds something useful", "yields a key item", "might be worth visiting", "might have what you're looking for"],["has no key items", "is dry on pickups","is an empty location", "might be empty", "is completely void of key items","might not have what you're looking for"]],
    importantlocations: { element: "has an element", key: "has a key item", shade: "has a shade" }
}


// Returns hint info from a specific entry on the list, to inject in the game
export function getHintListEntry(mapCheckId: string, map: string) {
    let index: number = getHintIndex(mapCheckId, map)
    if (hintList && hintList[index]) {
        return {
            "icon": "INFO",
            "hoverText": { "en_US": hintList[index].type, "de_DE": hintList[index].type, "zh_CN": hintList[index].type, "ja_JP": hintList[index].type, "ko_KR": hintList[index].type, "langUid": 886, "zh_TW": hintList[index].type },
            "event": [
              {
                  "text": { "en_US": hintList[index].hint, "de_DE": hintList[index].hint, "zh_CN": hintList[index].hint, "ja_JP": hintList[index].hint, "ko_KR": hintList[index].hint, "langUid": 887, "zh_TW": hintList[index].hint },
                "center": false,
                "autoContinue": false,
                "type": "SHOW_BOARD_MSG"
              }
            ]
          }   
    }
    else {
        return {
            "icon": "INFO",
            "hoverText": { "en_US": "Missing Hint", "de_DE": "Missing Hint", "zh_CN": "Missing Hint", "ja_JP": "Missing Hint", "ko_KR": "Missing Hint", "langUid": 886, "zh_TW": "Missing Hint" },
            "event": [ { "text": { "en_US": "Missing Hint", "de_DE": "Missing Hint", "zh_CN": "Missing Hint", "ja_JP": "Missing Hint", "ko_KR": "Missing Hint", "langUid": 887, "zh_TW": "Missing Hint" }, "center": false, "autoContinue": false, "type": "SHOW_BOARD_MSG" } ]
        }  
    }
}

function getHintIndex(mapId: string, map: string) {
    let index = 0  
    let loreOverride = loreMapReplacements[map]
    let replacements = Object.keys(loreMapReplacements)

    for (let i = 0; i < replacements.length; i++) {
        if (map == replacements[i]) {
            for (let subIndex = 0; subIndex < Object.keys(loreOverride).length; subIndex++) {
                if (mapId == Object.keys(loreOverride)[subIndex])
                {
                    return index 
                }
                index++
            }
        }

        else {
            index += Object.keys(loreOverride).length
        }
    }

    return index
}

function getHintListLength (){
    let listLength = 0

    if (loreMapReplacements) {
        for (let i = 0; i < Object.keys(loreMapReplacements).length; i++) {
            listLength += Object.keys(loreMapReplacements[Object.keys(loreMapReplacements)[i]]).length
        }
        
    }
    return listLength
}

let hintList: any = []

export async function setLoreOverrides(directory: any) {
    loreMapReplacements = await readJsonFromFile(directory + "data/lore-replacements.json");
}

// Throws the area name based on the item's map
async function getArea(currentMap: any){
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
        areaInfo = await sc.map.areas[areaInfo].name["en_US"] // add a fix later on to match game language maybe
    }
    return areaInfo
}

// find a way to refer to generateRandomizerState.getPrettyName and just do everything with that function instead
async function getMapName(log: Check) {
    const database = await readJsonFromFile('assets/data/database.json');
    const shopsDatabase = database.shops;

    if (log.type === 'shop') { return shopsDatabase[log.name].name.en_US; };
    //TODO: quest names 
    if ('name' in log) { return log.name; };

    let fullMapName = log.mapName.split(/\-/g);
    let mapName = fullMapName[1].slice(1)
    
    return mapName;
}

function generateSentences() {
    let randomOKSentence = getRandomPhrase(connectorStrings.usefulconnector)
    let randomBadSentence = [getRandomPhrase(connectorStrings.badlocations[0]), getRandomPhrase(connectorStrings.badlocations[1])]
    let randomEmptySentence = getRandomPhrase(connectorStrings.emptylocations)
    let randomLockSentence = [getRandomPhrase(connectorStrings.lockedconnector[0]), getRandomPhrase(connectorStrings.lockedconnector[1])]
    let randomKeySentence = [getRandomPhrase(connectorStrings.keylocations[0]), getRandomPhrase(connectorStrings.keylocations[1])]

    return { randomEmptySentence, randomOKSentence, randomLockSentence, randomKeySentence, randomBadSentence };
}

function generateSentenceChances() {
        let doLockSentence = randomSeededChance(0.4)
        let doUselessSentence = randomSeededChance(0.05)
        let doAreaSentence = randomSeededChance(0.74)
        let doMapSentence = randomSeededChance(0.5)

        return { doLockSentence, doUselessSentence, doAreaSentence, doMapSentence };
}

// utils
function randomSeededChance(chance: number) {
    return (fixedRandomNumber(getCurrentSeedWithOffset()) < chance);
}

function getCurrentSeedWithOffset() {
    let seedOffset = currentSeed + seedIndex
    seedIndex++
    return seedOffset
}

const USEFUL_ITEMS = [145,149,170,154,155,156,225,153,236,376,147,230,345,286,231,410,439,434,350,"heat","shock","wave","cold"]
const ELEMENTS = ["heat", "shock", "cold", "wave"]
function isUsefulItem(currentItem: any) { 
    if (USEFUL_ITEMS.includes(currentItem)) {
        return true;
    }
    return false;
}

function isElement(currentItem: any) { 
    if (ELEMENTS.find(currentItem)) {
        return true;
    }
    return false;
}

// gets the item's name
function getItemInfo(item: any) {
    return ig.vars.get("item." + item + ".name")
}

