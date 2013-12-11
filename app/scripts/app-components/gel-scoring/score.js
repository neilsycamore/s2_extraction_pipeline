define([
  "text!app-components/gel-scoring/_score.html",
  "mapper/operations",
  // Code added to global namespace after this point
  "lib/underscore_extensions",
  "lib/jquery_extensions"
], function (partialScoring, Operations) {
  "use strict";

  var ROLE_SCORED = "samples.qc.gel.imager.done.scored", 
      ROLE_UNSCORED = "samples.qc.gel.imager.done";
  
  var templateScore = _.template(partialScoring);
  var getRoot;
  
  return function(context) {
    var view  = $("<div id='scoring-resource'></div>");
    getRoot = context.getS2Root;
    return {
      view:   view,
      events: {
        "selected-gel.gel-scoring-selection.s2": $.ignoresEvent(_.partial(renderScoringResource, view))
      }
    };
  };


  function renderScoringResource(view, resource) {
    getRoot().then(function(root) {
      root.findGelImageByGel(resource.uuid).then(function(gelImage){
        view.html("");
        var scoringHtml = templateScore({
          getSelectValue: _.partial(function(gelImage, value, label) {
            return gelImage.scores[label]===value? "selected" : "";
          }, gelImage),
          barcode: resource.labels.barcode.value,
          xLabels: _.times(resource.number_of_columns, _.identity),
          yLabels: _.times(resource.number_of_rows, function(n) { return String.fromCharCode("A".charCodeAt(0)+n); })
        });
        view.append(scoringHtml);
        $("[data-action-s2=download]").click(_.partial(download, view, gelImage, resource));
        $("[data-action-s2=save]").click(_.partial(save, view, gelImage, resource));
        $('#scoreModal').modal('show');        
      });
    });
  }
  
  function download(view, gelImage, gel) {
    // <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Base64_encoding_and_decoding>
    var fileContent = decodeURIComponent(escape(window.atob( gelImage.image )));
    var anchor = window.document.createElement('a');
    anchor.href = window.URL.createObjectURL(new Blob([fileContent], 
      {type: 'application/octet-stream;charset=utf-8;base64'}));
    anchor.download = gel.labels.barcode.value+'.jpg';

    // Append anchor to body.
    document.body.appendChild(anchor);
    anchor.click();

    // Remove anchor from body
    document.body.removeChild(anchor);
  }
  
  function save(view, gelImage, gel) {
    var data = {
      //uuid: resource.uuid,
      scores: _.chain($("td[data-position-s2]", view)).map(function(td) {
        var pos = $(td).attr("data-position-s2");
        var value = $("select", td).val();
        return [pos, value];
      }).object().value()
    };
    gelImage.score(data).then(function() {
      view.trigger("change-scored.selection.s2");
      // After scoring, we can change the role to scored
      changeRole(gel, view).then(function() {
        $('#scoreModal').modal('hide');
      });
    });
  }
  
  function changeRole(resource, view) {
    return resource.order().then(function(orderObj) {
      var Deferred = $.Deferred();
      if (!_.find(orderObj.items[ROLE_UNSCORED], function(item) { 
        return (item.uuid===resource.uuid && item.status==="done"); 
        })) {
        return false;
      }
      
      return {
        input: {
          order: orderObj,
          resource: resource,
          role: ROLE_UNSCORED
        },
        output: {
          order: orderObj,
          resource: resource,
          role: ROLE_SCORED
        }
      };
   }).then(function(data) {
     if (data) {
       view.trigger("success.status.s2", ["Created new score for gel"]);
       return Operations.stateManagement().start({ updates: [data]}).then(function() {
         return Operations.stateManagement().complete({ updates: [data]});
       });
     }
     view.trigger("success.status.s2", ["Updated score for gel"]);
   });
   
  }
});