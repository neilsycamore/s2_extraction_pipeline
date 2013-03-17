/*
 * S2 - An open source lab information management systems (LIMS)
 * Copyright (C) 2013  Wellcome Trust Sanger Insitute
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 1, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston MA  02110-1301 USA
 */


define(['config'
  , 'extraction_pipeline/presenters/base_presenter'
  , 'extraction_pipeline/default/default_view'
  , 'text!components/S2Mapper/test/json/dna_and_rna_manual_extraction_2.json'
],
    function (config, BasePresenter, view, dataJSON) {
      /*
       The default page presenter. Deals with login.
       */

      var DefaultPresenter = Object.create(BasePresenter);

      $.extend(DefaultPresenter, {
        /*
         input_model =
         {
         userBC : "1234567890"
         labware : "1234567890"
         }
         */
        setupPresenter:function (input_model, jquerySelection) {
          this.setupPlaceholder(jquerySelection);
          this.setupView();
          this.renderView();
          if (input_model && input_model.constructor == Object) {
            this.updateModel(input_model);
          } else {
            throw {message:"DataSchemaError"}
          }
          return this;
        },
        updateModel:function (input_model) {
          this.model = input_model;
          if (this.model) {
            // TODO: fix me -> eventually use a proper resource to check the user...
          }
          this.setupSubPresenters();

          return this;
        },
        setupSubPresenters:function () {
          // check with this.model for the needed subpresenters...
          this.userBCSubPresenter = this.presenterFactory.createScanBarcodePresenter(this);
          this.labwareBCSubPresenter = this.presenterFactory.createScanBarcodePresenter(this);
          this.setupSubModel();
          return this;
        },
        setupSubModel:function () {
          var that = this;
          var jQuerySelectionForUser = function () {
            return that.jquerySelection().find(".user_barcode");
          };

          var jQuerySelectionForLabware = function () {
            return that.jquerySelection().find(".labware_barcode");
          };

          if (this.userBCSubPresenter) {
            this.userBCSubPresenter.setupPresenter({type:"user", value:"XX111111K"}, jQuerySelectionForUser);
          }
          if (this.labwareBCSubPresenter) {
            this.labwareBCSubPresenter.setupPresenter({type:"tube", value:"XX111111K"}, jQuerySelectionForLabware);
          }
          return this;
        },
        setupView:function () {
          this.currentView = new view(this, this.jquerySelection);
          return this;
        },
        renderView:function () {
          // render view...
          var data = undefined;
          this.currentView.renderView(data);
          if (this.userBCSubPresenter) {
            this.userBCSubPresenter.renderView();
          }
          return this;
        },
        release:function () {
          this.currentView.release();
          return this;
        },
        childDone:function (child, action, data) {
          // called when a child  wants to say something...

          if (child === this.userBCSubPresenter) {
            if (action === "barcodeScanned") {
              return this.handleBarcodeScanned(data);
            }
          } else if (child === this.currentView) {
            if (action === "login") {
              var dataForLogin = {
                userBC:data.userBC,
                labwareBC:data.labwareBC
              };
              return this.login(dataForLogin);
            }
          }

          console.error("unhandled childDone event:");
          console.error("child: ", child);
          console.error("action: " + action);
          console.error("data: " + JSON.stringify(data));
          //return this.owner.childDone(child, action, data);
          return this;
        },
        login:function (dataForLogin) {
          // method called when try to login

          var thatTube, batch;
          var that = this;

          if (!dataForLogin.userBC) {
            console.warn("something wrong happened with the user");
            return this;
          }
          if (!dataForLogin.labwareBC) {
            console.warn("something wrong happened with the tube");
            return this;
          }

          this.getS2Root()
              .then(function (root) {
                config.setupTest(dataJSON);
                return root.tubes.findByEan13Barcode(dataForLogin.labwareBC);
              }).then(function (tube) {
                thatTube = tube;
                return tube.order();
              }).then(function (order) {
                return order.batchFor(function () {
                  return true;
                });
              }).then(function (batch) {
                that.owner.childDone(that, "login", {userUUID:dataForLogin.userBC, labware:thatTube, "batch":batch});
              }).fail(function () {
                if (thatTube) {
                  that.owner.childDone(that, "login", {userUUID:dataForLogin.userBC, labware:thatTube, "batch":undefined});
                } else {
                  console.error("Something went wrong");
                }
              }); // todo : handle error

          return this;
        }

      });

      return DefaultPresenter;
    }
);
