'use strict'

/* global chrome */

export const setIcon = promisifyChromeMethod(chrome.action.setIcon.bind(chrome.action))
export const sendMessage = promisifyChromeMethod(chrome.runtime.sendMessage.bind(chrome.runtime))
export const offscreenCreateDocument = promisifyChromeMethod(chrome.offscreen.createDocument.bind(chrome.offscreen))
export const storageSessionSet = promisifyChromeMethod(chrome.storage.session.set.bind(chrome.storage.session))
export const storageSessionGet = promisifyChromeMethod(chrome.storage.session.get.bind(chrome.storage.session))
export const storageSessionRemove = promisifyChromeMethod(chrome.storage.session.remove.bind(chrome.storage.session))
export const storageLocalGet = promisifyChromeMethod(chrome.storage.local.get.bind(chrome.storage.local))
export const storageLocalSet = promisifyChromeMethod(chrome.storage.local.set.bind(chrome.storage.local))
export const tabsCreate = promisifyChromeMethod(chrome.tabs.create.bind(chrome.tabs))
export const getPlatformInfo = promisifyChromeMethod(chrome.runtime.getPlatformInfo.bind(chrome.runtime))

function promisifyChromeMethod (method) {
  return (...args) =>
    new Promise((resolve, reject) => {
      method(...args, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || JSON.stringify(chrome.runtime.lastError)))
        } else {
          resolve(result)
        }
      })
    })
}
