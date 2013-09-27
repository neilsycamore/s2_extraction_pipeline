define([ 'config'
  , 'workflow_engine'
  , 'mapper/s2_root'
  , 'extra_components/busy_box'
  , 'alerts'
  , 'lib/logger'
  , 'lib/pubsub'

  , 'models/base_page_model'
  , 'lib/reception_templates'

  // Components, probably best loaded dynamically!
  , 'app-components/reception/component'
  , 'app-components/reracking/component'
], function(
  config,
  nextWorkflow,
  S2Root,
  BusyBox, alerts, Logger, PubSub,
  BasePageModel, ReceptionTemplates,
  ReceptionController, Reracking
) {
  'use strict';

  var ComponentConfig = [
    { name: "reception",  selector: ".sample-reception",     constructor: ReceptionController },
    { name: "re-racking", selector: ".extraction-reracking", constructor: Reracking }
  ];

  var App = function (theControllerFactory) {
    var app = this;
    app.config = config;
    app.controllerFactory = theControllerFactory;
    _.templateSettings.variable = 'templateData';

    $('#server-url').text(config.apiUrl);
    $('#release').text(config.release);

    var html = $("#content");
    html.on("s2.status.error", function(event, message) {
      PubSub.publish("s2.status.error", app, {message: message});
    });

    var activate = _.find(ComponentConfig, function(config) {
      return html.is(config.selector);
    });
    if (!_.isUndefined(activate)) {
      var component = activate.constructor({
        app:       app,

        templates: ReceptionTemplates,

        printers:  app.config.printers,
        print:     _.flip(BasePageModel.printBarcodes),

        user: function(barcode) {
          var deferred = $.Deferred();
          var user = app.config.UserData[barcode];
          deferred[_.isUndefined(user) ? 'reject' : 'resolve'](user);
          return deferred.promise();
        },

        resetS2Root: _.bind(app.resetS2Root, app),
        getS2Root:   _.bind(app.getS2Root, app)
      });
      html.append(component.view).on(component.events);

      alerts.setupPlaceholder(function() {
        return $("#alertContainer");
      });
      app.addEventHandlers();
    } else {
      // Handle the non-components
      // TODO: Move these to be components!
      if (html.is('.sample-extraction')) {
        // ToDo #content exists at this point we should pass it directly not a function
        app.jquerySelection = _.constant(html);
        app.addEventHandlers();
        app.setupController();
      } else {
        console.log('#content control class missing from web page.')
      }
    }
  };

  App.prototype.addEventHandlers = function(){
    BusyBox.init();
    Logger.init();
  };

  App.prototype.getS2Root = function(user) {
    if ( user || (this.rootPromise === undefined) ) {
      // User should be passed in here not hard-coded
      Logger.user = user;
      this.rootPromise = S2Root.load({user:user});
    }
    return this.rootPromise;
  };

  App.prototype.resetS2Root = function() {
    delete this.rootPromise;
  };

  App.prototype.setupController = function (inputModel) {
    alerts.setupPlaceholder(function () {
      return $('#alertContainer');
    });
    this.updateModel(inputModel || {});

    return this;
  };

  App.prototype.updateModel = function (model) {
    var application = this;
    this.model = $.extend(this.model, model);

    if (this.currentPageController) {
      this.currentPageController.release();
      delete this.currentPageController;
    }

    nextWorkflow(this.model).
      then(function(workflowConfig){
      $.extend(workflowConfig, {initialLabware: application.model.labware});
      return application.controllerFactory.create(workflowConfig && workflowConfig.controllerName, application, workflowConfig);
    }).then(function(nextController){
      application.currentPageController = nextController;
      application.currentPageController.setupController(application.model, application.jquerySelection);
      delete application.model.labware;
    });

    return this;
  };

  // "I'm a monster..."  ChildDone methods should be replaced with DOM events where possible.
  // This will probably be the last one to go.
  App.prototype.childDone = function (child, action, data) {
    console.log("A child of App (", child, ") said it has done the following action '" + action + "' with data :", data);

    var application = this;
    config.exceptionHandling(function() {
      if (action == "done") {
        application.updateModel(data);
      } else if (action == "login") {
        application.updateModel(data);
      }
    });
    return application;
  };

  return App;
});
