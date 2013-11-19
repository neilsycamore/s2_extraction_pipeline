define([
  "text!app-components/lysing/_component.html",
  "text!app-components/lysing/_input.html",
  "text!app-components/lysing/_output.html",
  "text!app-components/lysing/_print.html",

  "app-components/linear-process/linear-process",
  "app-components/labware/scanning",
  "app-components/labelling/printing",
  "labware/standard_mappers",
  "mapper/operations",

  // Added to the global namespace
  "lib/underscore_extensions",
  "lib/jquery_extensions"
], function(view, inputView, outputView, printView, LinearProcess, LabwareScanner, LabelPrinting, StandardRepresenter, Operations) {
  "use strict";

  var template        = _.compose($, _.template(view));
  var printTemplate   = _.compose($, _.template(printView));

  var InputComponent  = new LabwareComponent(_.compose($, _.template(inputView)));
  var OutputComponent = new LabwareComponent(_.compose($, _.template(outputView)));

  return function(context) {
    var $html   = template(context);
    var error   = _.partial(_.bind($html.trigger, $html), "error.status.s2");
    var success = _.partial(_.bind($html.trigger, $html), "success.status.s2");

    // The barcode that is generated by the label printing needs to be the only barcode that can be
    // scanned into the tube.  Until that tube is available no barcodes are acceptable.  Because
    // this is promise based, and side-effecty, we need to wrap our actual validator so that the
    // correct function is called.
    var barcodePromise = $.Deferred();
    var validator = _.constant(false);

    barcodePromise.then(function(tubeBarcode) {
      validator = function(barcode) {
        return barcode === tubeBarcode;
      };
    });

    var barcodeValidator = function(barcode) {
      return validator(barcode);
    };

    $html.on("registered.s2", $.stopsPropagation($.ignoresEvent(function(labware) {
      // Fires when labware has been created
      barcodePromise.resolve(labware.labels.barcode.value);
    })));

    // Build a linear process that ensures that they will scan the filter paper first, then print
    // the tube barcode, then scan that tube to confirm the correct value, which will signal the
    // completion of the transfer.
    var process = new LinearProcess({
      components:[{
        constructor: InputComponent,
        context:_.extend({root: context.root, representer: StandardRepresenter}, context.input)
      },
      {
        constructor: PrintComponent,
        context:_.extend({root: context.root, printers: context.printers},       context.output)
      },
      {
        constructor: OutputComponent,
        context:_.extend({root: context.root, representer: StandardRepresenter, validation: barcodeValidator}, context.output)
      }]
    });

    $html.append(process.view);

    // We need both the filter paper and the tube to be scanned in, and be valid, before we can
    // perform the transfer.  This means two promises that have to be resolved before the "done"
    // handler can be executed.
    var promises = {
      filter_paper: $.Deferred(),
      tube:         $.Deferred()
    };

    $html.on("present.labware.s2", $.ignoresEvent(function(labware) {
      promises[labware.resourceType].resolve(labware);
    }));

    $html.on("done.s2", $.stopsPropagation($.ignoresEvent(function(view) {
      if (view === $html[0]) { return true; }      // Us, firing.

      // Wait for the promises to resolve and ensure they are in a specific order!
      $.when.apply(undefined, _.map(["filter_paper","tube"], _.extractor(promises)))
      .fail(_.partial(error, "Resource failure but process succeeded!"))
      .then(_.partial(buildTransfer, context))
      .then(_.partial(performTransfer, context))
      .then(
        _.partial(success, "Transfer completed!"),
        _.partial(error, "Unable to perform the transfer")
      ).done(function() {
        $html.trigger("done.s2", $html);
      });
    })));


    return {
      view: $html,
      events: process.events
    };
  };

  // Build the transfer from the filter paper to the tube.  We take the entire contents of the last
  // position.
  function buildTransfer(context, filterPaper, tube) {
    return filterPaper.order().then(function(order) {
      return {
        input:{
          resource: filterPaper,
          role:     context.input.role,
          order:    order
        },
        output:{
          resource: tube,
          role:     context.output.role,
          batch:    undefined
        },
        "aliquot_type":    context.output.aliquotType,
        fraction:        1.0
      };
    });
  }

  function performTransfer(context, transfer) {
    return context.root().then(function(root) {
      return Operations.betweenLabware(
        root.actions.transfer_tubes_to_tubes,
        [prepare]
      );
    }).then(function(operation) {
      return operation.operation();
    });

    function prepare(operations) {
      operations.push(transfer);
      return $.Deferred().resolve(undefined);
    }
  }

  function LabwareComponent(template) {
    return function(context) {
      var html      = template(context);
      var component = new LabwareScanner(context);
      html.append(component.view);
      return {
        view: html,
        events: component.events
      };
    };
  }

  function PrintComponent(context) {
    var eventsToBindToUs = ["labels.print.s2", "filter.print.s2"];

    var $printHtml = printTemplate(context);

    // Setup a label printing section that deals with the appropriate model
    var printing = new LabelPrinting({
      printers: context.printers
    });

    // Take a list of events, from the printing component, to bind to the $printHtml
    $printHtml.append(printing.view).on(_.pick(printing.events, eventsToBindToUs));
    $printHtml.trigger("filter.print.s2", function(printer) { return printer.canPrint(context.model); });

    // When the user requests labels to be printed we need to register a new resource with the
    // system, and then print the labels that were attached to it as part of that step.
    $printHtml.on("trigger.print.s2", $.stopsPropagation($.ignoresEvent(function(printer) {
      context.root().then(function(root) {
        Operations.registerLabware(
          root[context.model.pluralize()],
          context.aliquotType,
          context.purpose
        ).then(function(state) {
          // We need to signal that the labware has been registered and then request that the labels
          // are printed.
          $printHtml.trigger("registered.s2", state.labware);
          $printHtml.trigger("labels.print.s2", [printer, [state.labware]]);
        });
      });
    })));

    return {
      view:   $printHtml,

      // Pass up any event handlers that we aren't going to bind locally to
      // $printHtml
      events: _.omit(printing.events, eventsToBindToUs)
    };
  }
});
