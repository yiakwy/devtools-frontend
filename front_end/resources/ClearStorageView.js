// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {WebInspector.TargetManager.Observer}
 * @unrestricted
 */
WebInspector.ClearStorageView = class extends WebInspector.VBox {
  /**
   * @param {!WebInspector.ResourcesPanel} resourcesPanel
   */
  constructor(resourcesPanel) {
    super(true);

    this._resourcesPanel = resourcesPanel;
    this._reportView = new WebInspector.ReportView(WebInspector.UIString('Clear storage'));
    this._reportView.registerRequiredCSS('resources/clearStorageView.css');
    this._reportView.element.classList.add('clear-storage-header');
    this._reportView.show(this.contentElement);

    this._settings = new Map();
    for (var type
             of [Protocol.Storage.StorageType.Appcache, Protocol.Storage.StorageType.Cache_storage,
                 Protocol.Storage.StorageType.Cookies, Protocol.Storage.StorageType.Indexeddb,
                 Protocol.Storage.StorageType.Local_storage, Protocol.Storage.StorageType.Service_workers,
                 Protocol.Storage.StorageType.Websql]) {
      this._settings.set(type, WebInspector.settings.createSetting('clear-storage-' + type, true));
    }

    var application = this._reportView.appendSection(WebInspector.UIString('Application'));
    this._appendItem(application, WebInspector.UIString('Unregister service workers'), 'service_workers');

    var storage = this._reportView.appendSection(WebInspector.UIString('Storage'));
    this._appendItem(storage, WebInspector.UIString('Local and session storage'), 'local_storage');
    this._appendItem(storage, WebInspector.UIString('Indexed DB'), 'indexeddb');
    this._appendItem(storage, WebInspector.UIString('Web SQL'), 'websql');
    this._appendItem(storage, WebInspector.UIString('Cookies'), 'cookies');

    var caches = this._reportView.appendSection(WebInspector.UIString('Cache'));
    this._appendItem(caches, WebInspector.UIString('Cache storage'), 'cache_storage');
    this._appendItem(caches, WebInspector.UIString('Application cache'), 'appcache');

    WebInspector.targetManager.observeTargets(this, WebInspector.Target.Capability.Browser);
    var footer = this._reportView.appendSection('', 'clear-storage-button').appendRow();
    this._clearButton = createTextButton(
        WebInspector.UIString('Clear site data'), this._clear.bind(this), WebInspector.UIString('Clear site data'));
    footer.appendChild(this._clearButton);
  }

  /**
   * @param {!WebInspector.ReportView.Section} section
   * @param {string} title
   * @param {string} settingName
   */
  _appendItem(section, title, settingName) {
    var row = section.appendRow();
    row.appendChild(WebInspector.SettingsUI.createSettingCheckbox(title, this._settings.get(settingName), true));
  }

  /**
   * @override
   * @param {!WebInspector.Target} target
   */
  targetAdded(target) {
    if (this._target)
      return;
    this._target = target;
    var securityOriginManager = WebInspector.SecurityOriginManager.fromTarget(target);
    this._updateOrigin(securityOriginManager.mainSecurityOrigin());
    securityOriginManager.addEventListener(
        WebInspector.SecurityOriginManager.Events.MainSecurityOriginChanged, this._originChanged, this);
  }

  /**
   * @override
   * @param {!WebInspector.Target} target
   */
  targetRemoved(target) {
    if (this._target !== target)
      return;
    var securityOriginManager = WebInspector.SecurityOriginManager.fromTarget(target);
    securityOriginManager.removeEventListener(
        WebInspector.SecurityOriginManager.Events.MainSecurityOriginChanged, this._originChanged, this);
  }

  /**
   * @param {!WebInspector.Event} event
   */
  _originChanged(event) {
    var origin = /** *@type {string} */ (event.data);
    this._updateOrigin(origin);
  }

  /**
   * @param {string} url
   */
  _updateOrigin(url) {
    this._securityOrigin = new WebInspector.ParsedURL(url).securityOrigin();
    this._reportView.setSubtitle(this._securityOrigin);
  }

  _clear() {
    var storageTypes = [];
    for (var type of this._settings.keys()) {
      if (this._settings.get(type).get())
        storageTypes.push(type);
    }

    this._target.storageAgent().clearDataForOrigin(this._securityOrigin, storageTypes.join(','));

    var set = new Set(storageTypes);
    var hasAll = set.has(Protocol.Storage.StorageType.All);
    if (set.has(Protocol.Storage.StorageType.Cookies) || hasAll)
      this._resourcesPanel.clearCookies(this._securityOrigin);

    if (set.has(Protocol.Storage.StorageType.Indexeddb) || hasAll) {
      for (var target of WebInspector.targetManager.targets()) {
        var indexedDBModel = WebInspector.IndexedDBModel.fromTarget(target);
        if (indexedDBModel)
          indexedDBModel.clearForOrigin(this._securityOrigin);
      }
    }

    if (set.has(Protocol.Storage.StorageType.Local_storage) || hasAll) {
      var storageModel = WebInspector.DOMStorageModel.fromTarget(this._target);
      if (storageModel)
        storageModel.clearForOrigin(this._securityOrigin);
    }

    if (set.has(Protocol.Storage.StorageType.Websql) || hasAll) {
      var databaseModel = WebInspector.DatabaseModel.fromTarget(this._target);
      if (databaseModel) {
        databaseModel.disable();
        databaseModel.enable();
      }
    }

    if (set.has(Protocol.Storage.StorageType.Cache_storage) || hasAll) {
      var target = WebInspector.targetManager.mainTarget();
      var model = target && WebInspector.ServiceWorkerCacheModel.fromTarget(target);
      if (model)
        model.clearForOrigin(this._securityOrigin);
    }

    if (set.has(Protocol.Storage.StorageType.Appcache) || hasAll) {
      var appcacheModel = WebInspector.ApplicationCacheModel.fromTarget(this._target);
      if (appcacheModel)
        appcacheModel.reset();
    }

    this._clearButton.disabled = true;
    this._clearButton.textContent = WebInspector.UIString('Clearing...');
    setTimeout(() => {
      this._clearButton.disabled = false;
      this._clearButton.textContent = WebInspector.UIString('Clear selected');
    }, 500);
  }
};
