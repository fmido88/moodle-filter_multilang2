// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Apply multilang filter from the client side using ajax request.
 *
 * @module     filter_multilang2/filter
 * @copyright  2025 Mohammad Farouk <phun.for.physics@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Ajax from 'core/ajax';
import {eventTypes, notifyFilterContentRenderingComplete} from 'core_filters/events';

let elements = [];
let data = [];
let onRequest = false;
let queue = [];
let retryTimeout;

/**
 * Queue filter event.
 * @param {CustomEvent} event
 */
function queueFilter(event = null) {
    queue.push({
        event: event,
        done: false,
    });
    runInterval();
}
/**
 * Stopping the queue.
 */
function stopInterval() {
    clearTimeout(retryTimeout);
}
/**
 * Rerun the interval to check for new data.
 */
function runInterval() {
    stopInterval();
    retryTimeout = setTimeout(processQueue, 500);
}

/**
 * Process the queue of filter requests.
 * @returns {void}
 */
function processQueue() {
    clearTimeout(retryTimeout);
    if (queue.length == 0) {
        return;
    }

    if (onRequest) {
        runInterval();
        return;
    }

    let item;
    for (let i = 0; i < queue.length; i++) {
        item = queue[i];
        if (item.done) {
            queue.splice(i, 1);
            continue;
        }

        if (item.event) {
            break;
        }

        item = null;
    }
    if (item) {
        runInterval();
        filter(item.event);
    }
}

/**
 * Process filtering.
 * @param {?CustomEvent} event
 */
async function filter(event = null) {
    if (onRequest) {
        queueFilter(event);
        return;
    }

    onRequest = true;
    let contextid = M.cfg.contextid;
    let selectors;
    if (event && event.originalEvent && event.originalEvent.detail.nodes) {
        selectors = event.originalEvent.detail.nodes;
    } else {
        selectors = ['body'];
    }

    $.each(selectors, function(index, element) {

        // Exclude head and scripts.
        let exclude = 'script, noscript, head, style';
        // Exclude resources.
        exclude += ', img, video, audio, canvas, svg, object, embed, iframe, link, source';
        // Exclude inputs.
        exclude += ', input, textarea, [data-fieldtype="textarea"], [data-fieldtype="editor"]';
        // Exclude editable elements as it considered inputs.
        exclude += ', [contenteditable="true"]';
        // Exclude display elements.
        exclude += ', code, pre';
        // Manually ignored.
        exclude += ', .ignore-multilang';

        // Get the element and its siblings.
        // Modal event for example not include footer and header in the event nodes.
        $(element)
        .parent().not(exclude)
        .children().not(exclude)
        .find('*').not(exclude)
        .each(function() {
            let parent = $(this);
            if (parent.parents(exclude).length > 0) {
                return;
            }

            parent.contents().each(function() {
                if (this.nodeType === 3) { // Text node.
                    if (this.textContent.toLowerCase().includes('mlang')) {
                        elements.push(this);
                        data.push(this.textContent);
                    }
                } else if (this.nodeType === 1) { // Element node.
                    let current = $(this);

                    if (current.is(exclude)) {
                        return;
                    }

                    if (current.children().length > 0) { // Only check final child.
                        return;
                    }

                    if (elements.includes(this)) { // Already added.
                        return;
                    }

                    if (current.text().toLowerCase().includes('mlang')) {
                        elements.push(this);
                        data.push(current.text());
                    }
                }
            });
        });
    });

    if (data.length == 0) {
        elements = [];
        data = [];
        onRequest = false;
        // Prevent sending empty data request.
        return;
    }

    let requests = Ajax.call([
        {
            methodname: 'filter_multilang2',
            args: {
                contextid: contextid,
                data: data,
            },
        }
    ], true, false);

    let response = await requests[0];
    elements.forEach((element, index) => {
        if (element.nodeType === 3) {
            element.textContent = response[index];
        } else {
            $(element).text(response[index]);
        }
    });

    // Trigger events of what elements changed.
    notifyFilterContentRenderingComplete(elements);

    elements = [];
    data = [];
    onRequest = false;
}

export const init = function() {
    // Wait for the page to fully loaded.
    $(filter);

    // Apply the filter again if content changed.
    $(document).on(eventTypes.filterContentUpdated, filter);
};