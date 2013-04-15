define([
  'labware/presenters/tube_presenter',
  'labware/presenters/spin_column_presenter',
  'labware/presenters/waste_tube_presenter',

  // Add new presenters after this point for automatic registration
  'extraction_pipeline/presenters/selection_page_presenter',
  'extraction_pipeline/default/default_presenter',
  'extraction_pipeline/presenters/kit_binding_page_presenter',
  'extraction_pipeline/presenters/row_presenter',
  'extraction_pipeline/presenters/labware_presenter',
  'extraction_pipeline/presenters/elution_page_presenter',
  'extraction_pipeline/presenters/scan_barcode_presenter',
  'extraction_pipeline/presenters/byproduct_transfer_page_presenter',
  //  'extraction_pipeline/presenters/elution_wash_page_presenter',
], function(TubePresenter, SpinColumnPresenter, WasteTubePresenter) {
  'use strict';

  var PresenterFactory = function () {
    /* Construct an instance of PresenterFactory
     *
     * This is an implementation of the AbstractFactory pattern. The
     * intention of using the pattern is to allow presenters that create
     * partial presenters to have a mock implementation in the testing. Otherwise
     * views are likely to be created in the testing, which will likely mess about
     * with the Jasmine testing library.
     */
    return this;
  };

  PresenterFactory.prototype.presenters = _.chain(arguments).drop(3).reduce(function(presenters, presenter) {
    presenter.register(function(name, method) { presenters[name] = method; });
    return presenters;
  }, {
    createSpinColumnPresenter: function(owner) { return new SpinColumnPresenter(owner, this); },
    createTubePresenter:       function(owner) { return new TubePresenter(owner, this); },
    createWasteTubePresenter:  function(owner) { return new WasteTubePresenter(owner, this); }
  }).value();

  // Function can take variable number of parameters, passing them onto the constructor function
  // for the named presenter.  It is here to ensure that the first two arguments are always the
  // owner and the factory with which the presenter was registered.
  PresenterFactory.prototype.create = function(name, owner) {
    var constructor = this.presenters[name] || this.presenters.default;
    return $.extend(
      _.partial(constructor, owner, this).apply(null, _.chain(arguments).drop(2).value()),
      { presenter_type_name_debug: name }
    );
  };

  PresenterFactory.prototype.createLabwareSubPresenter = function(owner, type) {
    switch (type) {
      case 'tube':        return this.presenters.createTubePresenter(owner);       break;
      case 'spin_column': return this.presenters.createSpinColumnPresenter(owner); break;
      case 'waste_tube':  return this.presenters.createWasteTubePresenter(owner);  break;
      default:            debugger;
    }
  };

  return PresenterFactory;
});
