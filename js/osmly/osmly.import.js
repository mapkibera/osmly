/* jshint multistr:true */
osmly.import = (function() {
    var imp = {};

    imp.go = function(){
        setInterface();
        bind();
        next();
    };

    imp.stop = function() {
       unbind();
       unsetInterface();
    };

    function bind() {
        // bottom-right buttons
        $('#josm').on('click', josm);
        $('#reset').on('click', reset);
        $('#osmlink').on('click', function(){
            window.open(osmly.osmlink);
        });
        // botton-left buttons
        $('#skip').on('click', imp.skip);
        $('#problem').on('change', problem);
        $('#submit').on('click', submit);
        $('#add-new-tag').on('click', addTag);
        $('#tags').on('click', '.minus', function(){
            if ($('#tags tr').length > 1) this.parentNode.remove();
        });

        $('#osmtiles').on('click', function(){
            $('#tags').toggle();
            $('#action-block').toggle();
            osmly.map.toggleLayer(osmly.map.osmTiles);
            osmly.map.toggleLayer(osmly.map.contextLayer);
            osmly.map.toggleLayer(osmly.map.featureLayer);
        });

        $(document).on('click', '.merge', function(){
            // not sure why I can't do $('li').on...
            imp.mergeTags = JSON.parse(this.getAttribute('data-tags'));
            imp.mergeLayer = this.getAttribute('data-layer-id');
            imp.mergeLatLng = this.getAttribute('data-lat-lng');
            var conflicts = compareTags(imp.mergeTags);
            if (conflicts) {
                conflictModal(conflicts);
            } else {
                merge();
            }
        });

        $('#reusable-modal').on('click', 'button', function(){
            $('[data-tag="' + this.getAttribute('data-tag') +'"]').removeAttr('style');
            $('[data-tag="' + this.getAttribute('data-tag') +'"]').removeAttr('data-selected');
            this.setAttribute('style', 'background: #7EEE7A');
            this.setAttribute('data-selected', 'true');
        });

        $('#reusable-modal').on('click', '#merge', function() {
            // turn the selected buttons into tags
            var selected = $('[data-selected]');
            if (selected.length == this.getAttribute('data-count')) {
                for (var a = 0; a < selected.length; a++) {
                    imp.mergeTags[selected[a].getAttribute('data-tag')] = selected[a].textContent;
                }
            }
            merge();
        });
    }

    function unbind() {
        $('#skip, #problem, #submit').off();
        $('#josm, #reset, #osmlink, #osmtiles').off();
        $('#add-new-tag, #tags').off();
    }

    function setInterface() {
        var body = $('body');
        body.append('\
            <div id="tags">\
                <table>\
                    <tbody></tbody>\
                </table>\
                <span class="k" id="add-new-tag" alt="Add a new tag">+</span>\
            </div>\
        ');

        body.append('\
            <div id="action-block">\
                <li id="hold-problem" style="margin-left: 0;">\
                    <select name="problem" id="problem">\
                        <option value="problem" disabled selected>Problem</option>\
                    </select>\
                </li>\
                <li id="skip">Skip</li>\
                <li id="submit">Submit</li>\
            </div>\
        ');

        var problem = $('#problem');
        for (var p = 0; p < osmly.settings.problems.length; p++) {
            problem.append('<option value="'+[p]+'">'+osmly.settings.problems[p]+'</option>');
        }

        body.append('\
            <ul id="bottom-right">\
                <li id="reset">reset</li>\
                <li id="josm">edit in JOSM</li>\
                <li id="osmtiles">see OSM map</li>\
                <li id="osmlink" style="border-bottom: none;">open at osm.org</li>\
            </ul>\
        ');

        body.append('\
            <div id="flash">\
                <div style="position: relative">\
                    <img class="problem hidden flash" src="dist/problem.svg" />\
                    <img class="right-arrow hidden flash" src="dist/right-arrow.svg" />\
                    <img class="up-arrow hidden flash" src="dist/up-arrow.svg" />\
                </div>\
            </div>\
        ');
    }

    function unsetInterface() {
        $('#tags, #action-block, #bottom-right, #flash').remove();
        osmly.map.closePopup();
        if (osmly.map.hasLayer(osmly.map.featureLayer)) osmly.map.removeLayer(osmly.map.featureLayer);
        if (osmly.map.hasLayer(osmly.map.contextLayer)) osmly.map.removeLayer(osmly.map.contextLayer);
    }

    function displayItem() {
        osmly.map.addLayer(osmly.map.featureLayer);
        osmly.map.addLayer(osmly.map.contextLayer);

        $('#notify').hide();
        $('#hold-problem, #submit, #bottom-right, #action-block').fadeIn(200);
        
        if (imp.isEditable) {
            $('#tags').fadeIn(200);
        } else {
            $('#hold-problem, #submit').hide();
            $('#reusable-modal .modal-content').html(
                '<h3>This feature is too complex. <a>Edit it in JOSM?</a></h3>');
            // put an 'Edit in JOSM' button right there
                // when clicked close the modal and let the other modal open
            // literally bind, $('#josm').click()
            CSSModal.open('reusable-modal');
        }
    }

    function populateTags(tags) {
        $('#tags tr').remove();
        for (var tag in tags) {
            if (tags[tag] !== null && tags[tag] !== 'null') {
                $('#tags tbody').append(
                    '<tr>' +
                    '<td class="k" spellcheck="false" contenteditable="true">' +
                    tag + '</td>' +
                    '<td class="v" spellcheck="false" contenteditable="true">' +
                    tags[tag] + '</td>' +
                    '<td class="minus">-</td>' +
                    '</tr>');
            }
        }
    }

    function hideItem(callback) {
        $('#bottom-right, #action-block, #tags').hide();
        if (callback) callback();
        osmly.map.closePopup();
        if (osmly.map.featureLayer) osmly.map.removeLayer(osmly.map.featureLayer);
        osmly.map.removeLayer(osmly.map.contextLayer);
    }

    imp.skip = function() {
        imp.deleted = [];
        hideItem();
        leftToRight($('.right-arrow'));
        next();
    };

    function submit() {
        hideItem();
        if (osmly.auth.authenticated() && osmly.auth.userAllowed()) {
            osmly.connect.updateItem('submit');
            osmly.connect.openChangeset(submitToOSM);
        } else {
            $('#tags tr').remove();
            next();
        }
        bigUp($('.up-arrow'));
    }

    function problem() {
        hideItem();

        if (osmly.auth.authenticated() && osmly.auth.userAllowed()) {
            var pro = parseInt($('#problem').val()) + 1;
            osmly.connect.updateItem('problem', {
                problem: $('#problem option')[pro].text
            });
        }
        $('.problem').show(function(){
            setTimeout(function(){
                $('.problem').fadeOut(250);
            }, 250);
        });
        $('#problem').val('problem');
        $('#tags tr').remove();
        next();
    }

    function josm() {
        $('#reset').trigger('click');
        osmly.connect.editInJosm(imp.id);
    }

    function reset() {
        $('#tags tr').remove();
        hideItem();
        osmly.map.setFeature(imp.data, imp.isEditable);
        populateTags(imp.data.properties);
        imp.deleted = [];
        displayItem();
    }

    function addTag() {
        $('#tags tbody').append('\
            <tr>\
            <td class="k" spellcheck="false" contenteditable="true"></td>\
            <td class="v" spellcheck="false" contenteditable="true"></td>\
            <td class="minus">-</td>\
            </tr>\
        ');
    }

    function next() {
        if (osmly.map.hasLayer(osmly.map.featureLayer))
            osmly.map.removeLayer(osmly.map.featureLayer);

        osmly.ui.notify('getting next item');

        $.ajax({
            url: osmly.settings.db,
            dataType: 'json',
            success: function(data) {
                if (data) nextPrep(data);
                else none();
            }
        });
    }

    function nextPrep(data) {
        data = JSON.parse(data);
        imp.data = data;
        imp.id = imp.data.properties.id;
        imp.bbox = imp.data.properties.bounds;
        imp.isEditable = isEditable(imp.data.geometry);
        osmly.map.setFeature(imp.data, imp.isEditable);
        imp.prepTags();

        if (imp.isEditable) {
            osmly.map.context(imp.bbox, 0.001, function() {
                populateTags(imp.data.properties);
                displayItem();
            });
        } else {
            populateTags(imp.data.properties);
            displayItem();
        }
    }

    function none() {
        $('#notify').hide();
        $('#reusable-modal .modal-content').html('<h3>Nothing left, checkout Overview.</h3>');
        CSSModal.open('reusable-modal');
    }

    function isEditable(geo) {
        // checks if the feature has holes, leaflet can't edit them
        if (geo.type == 'Polygon' && geo.coordinates.length > 1) return false;

        if (geo.type == 'MultiPolygon') {
            for (var a = 0, b = geo.coordinates.length; a < b; a += 1) {
                if (geo.coordinates[a].length > 1) return false;
            }
        }
        return true;
    }

    imp.prepTags = function(tags) {
        // this needs to be used for editInJosm in .connect
        // bound to data.properties right now
        renameProperties();
        usePropertiesAsTag();
        appendTags();
    };

    function renameProperties() {
        // converts the feature key, doesn't remove old one
        // ex. NAME -> name, CAT2 -> leisure
        for (var prop in osmly.settings.renameProperty) {
            var change = osmly.settings.renameProperty[prop];
            imp.data.properties[change] = imp.data.properties[prop];
        }
    }

    function usePropertiesAsTag() {
        // filters properties to be used as tags
        for (var prop in imp.data.properties) {
            if (osmly.settings.usePropertyAsTag.indexOf(prop) === -1) {
                imp.data.properties[prop] = null;
            }
        }
    }

    function appendTags() {
        for (var append in osmly.settings.appendTag) {
            imp.data.properties[append] = osmly.settings.appendTag[append];
        }
    }

    imp.tags = function(){
        var tgs = byId('tags'),
            trs = tgs.getElementsByTagName('tr'),
            tags = {};

        for (var a=0; a < trs.length; a++) {
            // 0 = key, 1 = value, 2 = minus
            var tds = trs[a].getElementsByTagName('td');
            if (tds[0].innerHTML !== '' && tds[1].innerHTML !== '') {
                tags[tds[0].innerHTML] = tds[1].innerHTML;
            }
        }

        return tags;
    };

    function submitToOSM() {
        var id = token(osmly.settings.db + 'changeset_id');

        $('#changeset-link').html('<a href="' + osmly.settings.writeApi +
            '/browse/changeset/' + id + '" target="_blank">Details on osm.org »</a>');
        $('#changeset').show();

        var geojson = osmly.map.featureLayer.toGeoJSON();
        geojson['features'][0]['properties'] = discardTags();
        var action = "create";
        if (geojson['features'][0]['properties']['osm_id']) {
          action = "modify";
          imp.deleted.splice(imp.deleted.indexOf( geojson['features'][0]['properties']['osm_id'] ), 1);
        }
        var osmChange = osm_geojson.geojson2osm(geojson, token(osmly.settings.db + 'changeset_id'));
        osmChange = osmChange.split('<osm version="0.6" generator="github.com/aaronlidman/osm-and-geojson">')
            .join('<osmChange version="0.6" generator="OSMLY"><' + action + '>');
        osmChange = osmChange.split('</osm>')
            .join('');
        osmChange += '</' + action + '>';
        osmChange += buildDelete();
        osmChange += '</osmChange>';

        osmly.ui.notify('uploading to OSM');

        osmly.auth.xhr({
            method: 'POST',
            path: '/api/0.6/changeset/' + id + '/upload',
            content: osmChange,
            options: {header: {'Content-Type': 'text/xml'}}
        }, postOSM);
    }

    function discardTags() {
        var tags = osmly.import.tags();
        for (var tag in tags) {
            for (var a = 0; a < osmly.settings.discardTags.length; a++) {
                if (osmly.settings.discardTags[a] == tag) delete tags[tag];
            }
        }
        return tags;
    }

    function postOSM(err, res) {
        if (res && !err) {
            // do some kind of special green checkmark
        } else {
            osmly.connect.openChangeset(submitToOSM, true);
        }
        $('#tags tr').remove();
        next();
    }

    function compareTags(tags) {
        var conflicts = {},
            count = 0,
            importTags = osmly.import.tags();
        for (var tag in tags) {
            if (importTags[tag] && (importTags[tag] != tags[tag])) {
                conflicts[tag] = tags[tag];
                count++;
            }
        }
        if (count) return conflicts;
        return false;
    }

    function conflictModal(conflicts) {
        $('#reusable-modal #modal-label').html('<h2>Tag Conflict</h2>');

        var html = '',
            importTags = osmly.import.tags(),
            count = 0;

        for (var conflict in conflicts) {
            html += '<div class="conflict">' +
                '\'' + conflict + '\' is ' +
                '<button class="eee" data-tag="' + conflict + '" data-source="import">' + importTags[conflict] + '</button> or ' +
                '<button class="eee" data-tag="' + conflict + '" data-source="osm">' + conflicts[conflict] + '</button> ?' +
                '</div>';
            count++;
        }

        html += '<span id="merge" data-count="' + count + '" style="cursor: pointer; font-weight: bold;">Merge</span>';

        $('#reusable-modal .modal-content').html(html);
        CSSModal.open('reusable-modal');
    }

    function merge() {
        var tags = {};
        if (!imp.deleted) imp.deleted = [];
        imp.deleted.push(imp.mergeTags.osm_id);

        for (var tag in imp.mergeTags) {
            if (tag.split('osm_').length === 1 || osmly.settings.merge_preserve) {
                tags[tag] = imp.mergeTags[tag];
            }
        }
        populateTags(tags);
        osmly.map.featureLayer.eachLayer(function(layer) {
          if (layer instanceof L.Marker && imp.mergeLatLng) {
            latlng = imp.mergeLatLng.split(',');
            layer.setLatLng(L.latLng(latlng[0],latlng[1]));
          }
        });
        CSSModal.close();
        osmly.map.eachLayer(function(layer) {
            if (typeof layer.feature !== 'undefined' &&
                typeof layer.feature.properties !== 'undefined' &&
                typeof layer.feature.properties._id !== 'undefined' &&
                layer.feature.properties._id == parseInt(imp.mergeLayer) ) {
                    osmly.map.removeLayer(layer);
            }
        });
    }

    function buildDelete() {
        if (!('deleted' in imp) || !imp.deleted.length) return '';
        if (osmly.settings.writeApi.split('dev').length > 1) return '';
        var xml = '<delete if-unused="true">',
            s = new XMLSerializer();
        for (var id in imp.deleted) {
            var element = osmly.map.osmContext.getElementById(imp.deleted[id]);
            element.setAttribute('changeset', token(osmly.settings.db + 'changeset_id'));
            xml += s.serializeToString(element);
        }
        xml = xml.split('\t').join('');
        xml = xml.split('\n').join('');
        return xml + '</delete>';
    }

    imp.bindContextNodes = function() {
        var layers = osmly.map.contextLayer._map._layers;
        for (var layer in layers) {
            layer = layers[layer];
            if (layer._icon && layer.options.opacity && layer.options.opacity === 1) {
                console.log('bound');
                layer.on('mouseover', function() {
                    // do whatever
                    console.log('sticky door');
                });
            }
        }
        // need to make context nodes some kind of markers
    };

    return imp;
}());
