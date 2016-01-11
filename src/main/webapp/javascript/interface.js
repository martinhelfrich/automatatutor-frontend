/**
 * @file Interface for drawing automata
 *
 * @author Matthew Weaver [mweaver223@gmail.com], Alexander Weinert [weinert@react.uni-saarland.de]
 * @param deterministic Legacy parameter, will be removed soon. For now, the styles detbuchiaut and nondetbuchiaut are
 *	overridden by this parameter.
 * @param style Optional. The type of automaton-like thing to be drawn.
 *	May be one of 'detbuchiaut', 'nondetbuchiaut', 'buchigame', 'paritygame'.
 * 	Defaults to 'detbuchiaut' if none is given
 */
$.SvgCanvas = function(container, config, deterministic, style) {

	if (style === undefined) style = 'detbuchiaut'

	if (['detbuchiaut', 'nondetbuchiaut', 'buchigame', 'paritygame'].indexOf(style) == -1) {
		throw new Error("Unknown style " + style)
	}

    var Utils = this.Utils = function() {

	var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

	return {	   
		
	    "toXml": function(str) {
		return $('<p/>').text(str).html();
	    },
	    
	    "fromXml": function(str) {
		return $('<p/>').html(str).text();
	    },
	    
	    "convertToXMLReferences": function(input) {
		var output = '';
		for (var n = 0; n < input.length; n++){
		    var c = input.charCodeAt(n);
		    if (c < 128) {
			output += input[n];
		    }
		    else if(c > 127) {
			output += ("&#" + c + ";");
		    }
		}
		return output;
	    },
	    
	    "rectsIntersect": function(r1, r2) {
		return r2.x < (r1.x+r1.width) && 
		    (r2.x+r2.width) > r1.x &&
		    r2.y < (r1.y+r1.height) &&
		    (r2.y+r2.height) > r1.y;
	    },
	    
	    "snapToAngle": function(x1,y1,x2,y2) {
		var snap = Math.PI/4; // 45 degrees
		var dx = x2 - x1;
		var dy = y2 - y1;
		var angle = Math.atan2(dy,dx);
		var dist = Math.sqrt(dx * dx + dy * dy);
		var snapangle= Math.round(angle/snap)*snap;
		var x = x1 + dist*Math.cos(snapangle);  
		var y = y1 + dist*Math.sin(snapangle);
		return {x:x, y:y, a:snapangle};
	    },
	    
	    // TODO: This only works in firefox, find cross-browser compatible method
	    "text2xml": function(sXML) {
		var dXML = new DOMParser();
		dXML.async = false;
		var out = dXML.parseFromString(sXML, "text/xml");
		return out;
	    }
	}

    }();
    
    // set up SVG for D3
    var width = config.dimensions[0];
    var height = config.dimensions[1];
    var nodeRadius = 15;

    var started = false;
    var locked = false;

    var svg = d3.select(container)
	.append('svg')
	.attr('width', width)
	.attr('height', height);

    // set up initial nodes and links
    var nodes = [],
	lastNodeId = -1,
	links = [],
	alphabet = [];

    // init D3 force layout
    var force;

    // setup dragging behavior for nodes and links
    var draggingNode = false;             // true when a node is currently being dragged in interface
    var node_drag;                        // variable that ultimately contains dragging behavior for nodes in interface
    var draggingLink = false;             // true when dragging a transition
    var draggingEntire = false;           // true when dragging all transitions between two states
    var newLink = false;                  // true when a new link is being dragged in the interface 
    var showMenu = false;                 // true when the NFA transition menu is being displayed
    var overTrash = false;                // true when the mouse is hovering over the trash icon
    var overClear = false;                // true when the mouse is hovering over the "clear all" button
    var epsilonTrans = !deterministic;    // true when epsilon transitions are being used
    var hover_label = false;              // true when hovering over label

    //define trashbin
    var trashLabel = svg.append('svg:image')
	.attr('xlink:href', '../images/trash_bin.png')
	.attr('x', width - 60)
	.attr('y', height - 60)
	.attr('width', 50)
	.attr('height', 50);

    //define clear button
    var clearRect = svg.append('svg:rect')
	.attr('class', 'delete')
	.attr('width', 105)
	.attr('height', 26)
	.attr('x', width-104)
	.attr('y', -1)
	.on('mouseover', function() {
	    overClear = true;
	    clearRect.attr('width', 110)
		.attr('height', 29)
		.attr('x', width - 109);

	    clearText.attr('x', width - 100)
		.attr('y', 20);
	})
	.on('mouseout', function() {
	    overClear = false;

	    clearRect.attr('width', 105)
		.attr('height', 26)
		.attr('x', width - 104);

	    clearText.attr('x', width - 98)
		.attr('y', 18);
	})
	.on('mousedown', function() {
	    init();
	    restart();
	}); 
    var clearText = svg.append('svg:text')
	.text('Reset Canvas')
	.attr('x', width - 98)
	.attr('y', 18);

    // define arrow markers for graph links
    svg.append('svg:defs').append('svg:marker')
	.attr('id', 'end-arrow')
	.attr('viewBox', '0 -5 10 10')
	.attr('refX', 6)
	.attr('markerWidth', 4)
	.attr('markerHeight', 4)
	.attr('orient', 'auto')
	.append('svg:path')
	.attr('d', 'M0,-5L10,0L0,5')
	.attr('fill', '#000');

    // define initial state arrow
    var init_x1 = 0;
    var init_x2 = 0;
    var init_y = 0;
    var init_line = svg.append('svg:path')
		.attr('d', 'M' + init_x1 + ',' + init_y + ' L' + init_x2 + "," + init_y )
		.style('marker-end', 'url(#end-arrow)');

	if (style == 'detbuchiaut' || style == 'nondetbuchiaut') {
		init_line.attr('class', 'link initLine')
	}
	else if (style === 'buchigame' || style == 'paritygame') {
		init_line.attr('class', 'link initLine hidden')
	}
	else {
		throw new Error("Unknown style " + style)
	}

    // larger active areas for mouse events for varies parts of interface
    var hoverPath = svg.append('svg:g').selectAll('path'),
	path = svg.append('svg:g').selectAll('path'),
	hoverMenu = svg.append('svg:g').selectAll('g'),
	circle = svg.append('svg:g').selectAll('g'),
	labels = svg.append('svg:g').selectAll('text');

    var hiddenTrash = svg.append('svg:circle')
	.attr('class', 'hiddenTrash')
	.attr('cx', width)
	.attr('cy', height)
	.attr('r', 100)
	.on('mouseover', function() {
	    overTrash = true;

	    trashLabel.attr('x', width - 70)
		.attr('y', height - 80)
		.attr('width', 70)
		.attr('height', 70);

	    if(draggingLink && !deterministic)
		trash_link = mousedown_link;

	    return;
	})	
	.on('mouseout', function() {
	    overTrash = false;

	    trashLabel.attr('x', width - 60)
		.attr('y', height - 60)
		.attr('width', 50)
		.attr('height', 50);

	    trash_link = null;

	    return;
	})
	.on('mouseup', function() {
	    if(deterministic)
		return;
	    if(draggingLink && draggingEntire){
		var toSplice = links.filter( function(l) {
		    return (l.source === trash_link.source && l.target === trash_link.target);
		});

		toSplice.map(function(l) {
		    links.splice(links.indexOf(l), 1);
		});
	    }
	    else if(draggingLink)
		links.splice(links.indexOf(trash_link), 1);
	    
	    draggingLink = false;
	    draggingEntire = false;
	    restart();
	});

    var showWarning = false;
    var warningText = svg.append('svg:text')
	.attr('class', 'warning hidden')
	.attr('text-anchor', 'middle')
	.attr('x', width/2)
	.attr('y', 30)
	.text("This text should be changed before displaying!");

    var t = [];
    for(var i = 0; i < alphabet.length; i++) {
		t[i] = false;
	}
    var drag_trans = t;
    var drag_line = svg.append('svg:path')
		.attr('id', 'drag_line')
		.attr('class', 'link dragline hidden')
		.attr('d', 'M0,0L0,0');
    var drag_label = svg.append('svg:text')
		.text(function(d) { return makeLabel(drag_trans); })
		.attr('class', 'transLabel hidden')
		.attr('x', 0)
		.attr('y', 0);

    // mouse event vars
    var selected_node = null,    // Node selected by mouse in intervace
	hidden_link = null,      // Link being dragged (displayed invisible while dragging link is visible)
	mousedown_link = null,   // Link mousedown is over
	mousedown_node = null,   // Node mousdown is over
	mouseup_node = null,     // Node mouseup is over
	hover_node = null,       // Node mouse is hovering over
	hover_link = null,       // Link mouse is hovering over
	menu_node = null,        // Node selected by right click (for the displayed menu)
	menu_link = null,        // Link selected by right click (for the displayed menu)
	trash_link = null,       // Link currently dragged over trash
	mouse_x = null,          // x coordiante of mouse
	mouse_y = null,          // y coordinate of mouse
	old_target = null,       // previous target of transition being dragged
	initial_node;            // initial node of automata

    function resetMouseVars() {
	mousedown_node = null;
	mouseup_node = null;
	mousedown_link = null;
	old_target = null;
    }

    /**
     * Updates location of what is displayed by interface
     * (i.e. where the states and transitions are within the interface)
     * 
     */
    function tick() {

	//updates loc of init state arrow
	init_x1 = initial_node.x - 48 - nodeRadius;
	init_x2 = initial_node.x - 5 - nodeRadius;
	init_y = initial_node.y;
	init_line.attr('d', 'M' + init_x1 + ',' + init_y + ' L' + init_x2 + "," + init_y );

	// draws invisible wide paths for increased room when selecting links
	hoverPath.attr('d', drawPath);

	// draw directed edges with proper padding from node centers
	path.attr('d', drawPath);


	// draws labels above paths
	labels.attr('x', function(d) {
	    if(d.reflexive) {
		var angle = Math.PI / 2;
		if(d.source.flip)
		    angle = 3 * Math.PI / 2;
		var x = Math.round(d.source.x + nodeRadius * Math.cos(angle));
		var y = Math.round(d.source.y + nodeRadius * Math.sin(angle));
		var ax = Math.round(70 * Math.cos(angle + Math.PI / 4));
		var bx = Math.round(70 * Math.cos(angle - Math.PI / 4));
		if(d.source.reflexiveNum > 1)
		    return x + (ax + bx) / 2 + ((d.linknum - (.5 + d.source.reflexiveNum/2 ))/d.source.reflexiveNum)*(15*d.source.reflexiveNum);
		else
		    return x + (ax + bx) / 2;
	    }

	    var dx = d.target.x - d.source.x;
	    var dy = d.target.y - d.source.y;
	    var slope = dy / dx;
	    var angle = getAngle(dx, dy);
	    var nangle = angle + Math.PI / 2;
	    var edgeDeviation = 30;
	    var textDeviation = 20;
	    var edgeindex = d.linknum;
	    if(edgeindex > 0)
		edgeindex = 1;
	    if(d.flat)
		edgeindex = 0;
	    var deviation = edgeDeviation*edgeindex;
	    var textDev = ((deviation > 0) ? textDeviation : -textDeviation) + ((deviation * 3) / 4);
	    if(edgeindex === 0){
		if(d.source.x>d.target.x)
		    textDev = textDev + 38;
		else
		    textDev = textDev + 18;
	    }
	    edgeindex = d.linknum;
	    var totindex = d.totnum;
	    if(totindex > 1)
		return (d.source.x + d.target.x) / 2 + Math.cos(nangle) * (textDev - 8) + ((edgeindex - (.5 + totindex/2))/totindex)*(15*totindex);
	    else
		return (d.source.x + d.target.x) / 2 + Math.cos(nangle) * (textDev - 8); })
	    .attr('y', function(d) {
		if(d.reflexive) {
		    var angle = Math.PI / 2;
		    if(d.source.flip)
			angle = 3 * Math.PI / 2;
		    var x = Math.round(d.source.x + nodeRadius * Math.cos(angle));
		    var y = Math.round(d.source.y + nodeRadius * Math.sin(angle));
		    var ay = Math.round(70 * Math.sin(angle + Math.PI / 4));
		    var by = Math.round(70 * Math.sin(angle - Math.PI / 4));
		    if(y > d.source.y)
			return y + 10 + (ay + by) / 2;
		    return y + (ay + by) / 2;

		}

		var dx = d.target.x - d.source.x;
		var dy = d.target.y - d.source.y;
		var slope = dy / dx;
		var angle = getAngle(dx, dy);
		var nangle = angle + Math.PI / 2;
		var edgeDeviation = 30;
		var textDeviation = 20;
		var edgeindex = d.linknum;
		if(edgeindex > 0)
		    edgeindex = 1;
		if(d.flat)
		    edgeindex = 0;
		var deviation = edgeDeviation*edgeindex;
		var textDev = ((deviation > 0) ? textDeviation : -textDeviation) + ((deviation * 3) / 4);
		if(edgeindex === 0){
		    if(d.source.x > d.target.x)
			textDev = textDev + 25;
		    else
			textDev = textDev+15;
		}
		else if(d.source.x>d.target.x){
		    textDev = textDev-13;
		}
		else {
		    textDev = textDev -3;
		}


		return (d.source.y + d.target.y) / 2 + Math.sin(nangle) * textDev; });

	//updates circle position
	circle.attr('transform', function(d) {
	    return 'translate(' + d.x + ',' + d.y + ')';
	});

	//updates hover menu position, if drawing an NFA
	if(!deterministic){
	    hoverMenu.attr('transform', function(d) {
		return 'translate(' + d.x + ',' + d.y + ')';
	    });
	}
    }

    /**
     * Updates the contents of the interface
     *
     * In particular:
     *   adds/removes states and transitions in interface
     *   updates the various interface state variables (e.g. hover_node, etc...)
     */
    function restart() {
	linkNums(links);

	// updates/adds hoverPaths
	hoverPath = hoverPath.data(links);
	hoverPath.classed('hidden', function(d) { return d === hidden_link; });
	hoverPath.enter().append('svg:path')
	    .classed('hidden', function(d) { return d === hidden_link; })
	    .attr('class', 'link hoverPath')
	    .on('mouseover', function(d, i) {
		hover_link = d;
		menu_link = hover_link;

		var exp = path.filter(function(data) { return hover_link === data; });
		exp.classed('expanded', true);
		return;
	    })
	    .on('mouseout', function(d, i) {
		hover_link = d;

		var exp = path.filter(function(data) { return hover_link === data; });
		exp.classed('expanded', false);
		hover_link = null;
		return;
	    })
	    .on('mousedown', mousedownPath);
	hoverPath.exit().remove();

	// path (link) group
	path = path.data(links);
	// update existing links
	path.classed('hidden', function(d) { return d === hidden_link; })
	    .classed('expanded', function(d) {return d === hover_link; })
	    .style('marker-start', '')
	    .style('marker-end','url(#end-arrow)');
	// add new links
	path.enter().append('svg:path')
	    .attr('id', function(d, i) {return 'link' + i;})
	    .attr('class', 'link expanded')
	    .classed('hidden', function(d) { return d === hidden_link; })
	    .classed('expanded', function(d) {return d === hover_link; })
	    .style('marker-start', '')
	    .style('marker-end', 'url(#end-arrow)')
	    .on('mouseover', function(d) {
		hover_link = d;
		menu_link = hover_link;
		return;
	    })
	    .on('mouseout', function(d) {
		hover_link = null;
		return;
	    })
	    .on('mousedown', mousedownPath);
	// remove old links
	path.exit().remove();

	// add path labels
	labels = labels.data(links);

	labels.classed('hidden', function(d) { return d === hidden_link; })
	    .text(function(d) { return makeLabel(d.trans); });

	labels.enter().append('svg:text')
	    .attr('class', 'transLabel')
	    .text(function(d) { return makeLabel(d.trans); })
	    .on('mouseover', function(d, i) {
		hover_link = d;
		menu_link = hover_link;
		hover_label = true;
		return;
	    })
	    .on('mouseout', function(d, i) {
		hover_link = null;
		hover_label = false;
		return;
	    })
	    .on('mousedown', function(d, i) {
		if(d3.event.button === 1 || d3.event.button === 2) return;
		if(draggingNode) return;

		// select link
		mousedown_link = d;
		hidden_link = mousedown_link;
		selected_node = null;

		draggingLink = true;
		mousedown_node = d.source;

		drag_trans = mousedown_link.trans;

		// displays drag_line
		drag_line
		    .style('marker-end', 'url(#end-arrow)')
		    .classed('hidden', false)
		    .attr('d', 'M' + mousedown_node.x + ',' + mousedown_node.y + 'L' + mousedown_node.x + ',' + mousedown_node.y);
		drag_label
		    .text(function(d) { return makeLabel(drag_trans); })
		    .classed('hidden', false);

		restart();
	    });

	labels.exit().remove();


	// circle (node) group
	circle = circle.data(nodes, function(d) { return d.id; });

	// update existing nodes (reflexive & selected visual states)
	circle.selectAll('circle')
	    .classed('accepting', function(d) { return d.accepting; });

	// add new nodes
	var g = circle.enter().append('svg:g');

	g.append('svg:circle')
	    .attr('class', 'node')
	    .attr('r', nodeRadius)
	    .style('stroke', '#5B90B2')
	    .classed('accepting', function(d) { return d.accepting; })
	    .on('mouseover', function(d) {
		// enlarge target node
		hover_node = d;
		menu_node = hover_node;
		d.menu_visible = true;
		showMenu = true;
		d3.select(this).attr('transform', 'scale(1.1)');
		restart();
		return;
	    })
	    .on('mouseout', function(d) {
		// unenlarge target node
		hover_node = null;
		showMenu = false;
		d3.select(this).attr('transform', '');
		return;
	    })
	    .on('dblclick', function(d) {
		d.accepting = !d.accepting;
		restart();
		return;
	    })
	    .on('mousedown', function(d) {
		if(d3.event.button === 1 || d3.event.button === 2) return;
		hidden_link = null;
		selected_node = d;

		circle.call(node_drag);
		svg.classed('ctrl', true);
		draggingNode = true;

		resetMouseVars();
		restart();
		return;
	    })
	    .on('mouseup', function(d) {
		circle
		    .on('mousedown.drag', null)
		    .on('touchstart.drag', null);
		svg.classed('ctrl', false);
		draggingNode = false;


		if(!mousedown_node) return;

		// needed by FF
		drag_line
		    .classed('hidden', true)
		    .style('marker-end', '');
		drag_label
		    .classed('hidden', true);

		// check for drag-to-self
		mouseup_node = d;

		// unenlarge target node
		d3.select(this).attr('transform', '');

		if(draggingEntire){
		    // add link to graph (update if exists)
		    for(var i = 0; i < alphabet.length; i++)
		    {
			if(drag_trans[i]){
			    var t = []
			    for(var j = 0; j < alphabet.length; j++){
				t[j] = false;
			    }
			    t[i] = true;
			    var refl = false;
			    if(mousedown_node === mouseup_node) {
				refl = true;
				mousedown_node.reflexiveNum++;
			    }
			    links.push({source: mousedown_node, target: mouseup_node, reflexive: refl, trans: t});
			}
		    }

		    if(mousedown_link.reflexive)
			mousedown_link.source.reflexiveNum = mousedown_link.source.reflexiveNum - mousedown_link.trans.length;
		    links.splice(links.indexOf(mousedown_link), 1);
		}
		else if (newLink === true && !deterministic) {
		    
		    var multiplicityIssue = false;

		    for(var i = 0; i < links.length; i++){
			var transIssue = false;
			for(var j = 0; j < alphabet.length; j++){
			    if(links[i].trans[j] && drag_trans[j])
				transIssue = true;
			}
			if(links[i].source === mousedown_node && links[i].target === mouseup_node && transIssue)
			    multiplicityIssue = true;
		    }	

		    var epsilonIssue = epsilonTrans && (mousedown_node === mouseup_node) && drag_trans[alphabet.length -1];

		    if(!multiplicityIssue && !epsilonIssue){

			var refl = false;
			if(mousedown_node === mouseup_node) {
			    refl = true;
			    mousedown_node.reflexiveNum++;
			}
			links.push({source: mousedown_node, target: mouseup_node, reflexive: refl, trans: drag_trans});
		    }
		}
		else {
		    if(mousedown_link.reflexive) {
			mousedown_link.source.reflexiveNum--;
			mousedown_link.reflexive = false;
		    }

		    mousedown_link.target = d;

		    if(mousedown_link.target === mousedown_link.source) {
			mousedown_link.source.reflexiveNum++;
			mousedown_link.reflexive = true;
		    }
		}
		var t = [];
		for(var i = 0; i < alphabet.length; i++)
		    t[i] = false;
		drag_trans = t;

		linkNums(links);

		draggingLink = false;
		draggingEntire = false;
		newLink = false;
		hidden_link = null;
		resetMouseVars();
		restart();
	    });

	// show node IDs
	g.append('svg:text')
	    .attr('x', 0)
	    .attr('y', 5)
	    .attr('class', 'id')
	    .text(function(d) { return d.id; });

	// remove old nodes
	circle.exit().remove();

	// handles the hoverMenu, if drawing an NFA
	if(!deterministic) {
	    hoverMenu = hoverMenu.data(nodes, function(d) { return d.id; });
	    hoverMenu.selectAll('circle').classed('visible', function(d) { return (d.menu_visible && !newLink && !draggingLink && !draggingNode && showMenu); });
	    // add new nodes
	    var menus = hoverMenu.enter().append('svg:g');
	    menus.append('svg:circle')
		.attr('class', 'hoverMenu visible')
		.classed('visible', function(d) { return (d.menu_visible && !newLink && !draggingLink && !draggingNode && showMenu); })
		.attr('r', nodeRadius + 20)
		.on('mouseover', function(d) {
		    showMenu = true;
		})
		.on('mouseout', function(d) {
		    d.menu_visible = false;
		    showMenu = false;
		    restart();
		})
		.on('mousedown', function(d) {
		    d.menu_visible = false;
		    restart();
		});
	    hoverMenu.selectAll('text').classed('visible', function(d) { return (d.menu_visible && !newLink && !draggingLink && !draggingNode && showMenu); });
	    for(var i = 0; i < alphabet.length; i++){
		menus.append('svg:text')
		    .attr('class', 'hoverMenu visible')
		    .classed('visible', function(d) { return (d.menu_visible && !newLink && !draggingLink && !draggingNode && showMenu); })
		    .text(alphabet[i])
		    .attr('x', function() {
			var angle = 3*Math.PI/2 - (alphabet.length * Math.PI / 12) + (i + .5) * Math.PI/6;
			if(epsilonTrans)
			    angle = 3*Math.PI/2 - (alphabet.length * Math.PI / 12) + (i + 1) * Math.PI/6;
			if(epsilonTrans && i === alphabet.length - 1)
			    angle = Math.PI/2;
			return (nodeRadius + 10) * Math.cos(angle);
		    })
		    .attr('y', function() {
			var angle = 3*Math.PI/2 - (alphabet.length * Math.PI / 12) + (i + .5) * Math.PI/6;
			if(epsilonTrans)
			    angle = 3*Math.PI/2 - (alphabet.length * Math.PI / 12) + (i + 1) * Math.PI/6;
			if(epsilonTrans && i === alphabet.length - 1)
			    angle = Math.PI/2;
			return (nodeRadius + 10) * Math.sin(angle) + 5;
		    })
		    .on('mouseover', function(d) {
			d.menu_visible = true;
			showMenu = true;
			restart();
		    })
		    .on('mousedown', function(d) {
			d.menu_visible = false;
			showMenu = false;
			newLink = true;
			mousedown_node = d;

			for(var j = 0; j < alphabet.length; j++){
			    drag_trans[j] = false;
			}

			drag_trans[alphabet.indexOf(this.textContent)] = true;

			drag_line
			    .style('marker-end', 'url(#end-arrow)')
			    .classed('hidden', false)
			    .attr('d', 'M' + mousedown_node.x + ',' + mousedown_node.y + 'L' + mousedown_node.x + ',' + mousedown_node.y);
			drag_label
			    .text(function(d) { return makeLabel(drag_trans); })
			    .classed('hidden', false);				

			restart();
		    })
		    .on('mouseout', function(d) {
			showMenu = false;
		    });
	    }
	    hoverMenu.exit().remove();
	}

	warningText.classed('hidden', function(){
	    return !showWarning;
	});

	// set the graph in motion
	force.start();
    }

    /**
     * Calculates the formula for drawing paths
     *
     */
    function drawPath(d) {
	if(d.source === d.target) {
	    d.relfexive = true;

	    var angle = Math.PI / 2;
	    if(d.source.flip)
		angle = 3 * Math.PI / 2;
	    var x = Math.round(d.source.x + nodeRadius * Math.cos(angle));
	    var y = Math.round(d.source.y + nodeRadius * Math.sin(angle));
	    var x1 = Math.round(80 * Math.cos(angle + Math.PI / 4));
	    var y1 = Math.round(80 * Math.sin(angle + Math.PI / 4));
	    var x2 = Math.round(80 * Math.cos(angle - Math.PI / 4));
	    var y2 = Math.round(80 * Math.sin(angle - Math.PI / 4));
	    var x3 = Math.round(6 * Math.cos(angle - Math.PI / 4));
	    var y3 = Math.round(6 * Math.sin(angle - Math.PI / 4));
	    return 'M' + x + ',' + y + ' c' + x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' + x3 + ',' + y3 + '';
	}

	var x1 = d.source.x,
	    y1 = d.source.y,
	    x2 = d.target.x,
	    y2 = d.target.y;

	var dx = x2 - x1;
	var dy = y2 - y1;
	var slope = dy / dx;
	var angle = getAngle(dx, dy);
	var nangle = angle + Math.PI / 2;

	var third1x = (2 * x1 + x2) / 3;
	var third1y = (2 * y1 + y2) / 3;
	var third2x = (x1 + 2 * x2) / 3;
	var third2y = (y1 + 2 * y2) / 3;

	var offSet = d.totnum;
	var edgeDeviation = 30;
	var edgeindex = d.linknum;
	if(edgeindex > 0)
	    edgeindex = 1;
	if(d.flat)
	    edgeindex = 0;
	var deviation = edgeDeviation*edgeindex;

	var ay = third1y + Math.sin(nangle) * deviation;
	var ax = third1x + Math.cos(nangle) * deviation;
	var by = third2y + Math.sin(nangle) * deviation;
	var bx = third2x + Math.cos(nangle) * deviation;

	var len1 = Math.sqrt((ax - x1) * (ax - x1) + (ay - y1) * (ay - y1));
	var boundary1x = x1 + nodeRadius * (ax - x1) / len1;
	var boundary1y = y1 + nodeRadius * (ay - y1) / len1;

	var len2 = Math.sqrt((bx - x2) * (bx - x2) + (by - y2) * (by - y2));
	var boundary2x = x2 + (nodeRadius + 4) * (bx - x2) / len2;
	var boundary2y = y2 + (nodeRadius + 4) * (by - y2) / len2;

	return 'M' + boundary1x + ',' + boundary1y + ' C' + ax + ',' + ay + ' ' + bx + ',' + by + ' ' + boundary2x + ',' + boundary2y;
    }

    /**
     * Common mousedown event behavior for path and hoverPath
     *
     */
    function mousedownPath(d) {
	if(d3.event.button === 1 || d3.event.button === 2) return;

	if(draggingNode) return;

	// select link
	mousedown_link = d;
	selected_node = null;
	hidden_link = d;

	draggingLink = true;
	draggingEntire = true;
	mousedown_node = d.source;
	old_target = d.target;

	var tempTrans = [];
	for(var i = 0; i < alphabet.length; i++)
	    tempTrans[i] = false;

	for(var i = 0; i < links.length; i++){
	    if(mousedown_link.source === links[i].source && mousedown_link.target === links[i].target){
		for(var j = 0; j < alphabet.length; j++){
		    if(links[i].trans[j])
			tempTrans[j] = true;
		}
	    }
	}

	drag_trans = tempTrans;

	var toSplice = links.filter(function(l) {
	    return (l.source === mousedown_node && l.target === old_target && l != d);
	});
	toSplice.map(function(l) {
	    links.splice(links.indexOf(l), 1);
	});

	// displays drag_line
	drag_line
	    .style('marker-end', 'url(#end-arrow)')
	    .classed('hidden', false)
	    .attr('d', 'M' + mousedown_node.x + ',' + mousedown_node.y + 'L' + mousedown_node.x + ',' + mousedown_node.y);
	drag_label
	    .text(function(d) { return makeLabel(drag_trans); })
	    .classed('hidden', false);

	restart();
    }

    /**
     * General behavior for mousedown event
     *
     */
    function mousedown() {

	if(d3.event.button === 1 || d3.event.button === 2) return;
	// prevent I-bar on drag
	//d3.event.preventDefault();

	$('.contextMenu').css('display', 'none');

	// because :active only works in WebKit?
	svg.classed('active', true);

	if(draggingNode || mousedown_node || mousedown_link || overTrash || overClear) return;

	// insert new node at point
	var point = d3.mouse(this);
	addNode(point[0], point[1]);

	restart();
    }

    /**
     * General behavior for mousemove event
     *
     * In particular:
     *   Updates the position of drag_line when moving transition
     */
    function mousemove() {
	var point = d3.mouse(this);
	mouse_x = point[0];
	mouse_y = point[1];

	if(!showMenu && !deterministic) {
	    var restBool = false;
	    for(var i = 0; i < nodes.length; i++){
		if(nodes[i].menu_visible)
		    restBool = true;
		nodes[i].menu_visible = false;
	    }
	    if(restBool){
		restart();
	    }
	}

	if(!mousedown_node) return;

	if(draggingNode) return;

	var dx = d3.mouse(this)[0] - mousedown_node.x;
	var dy = d3.mouse(this)[1] - mousedown_node.y;
	var slope = dy / dx;
	var angle = getAngle(dx, dy);
	var nangle = angle + Math.PI / 2;
	var edgeDeviation = 30;
	var textDev = 20;

	// update drag line
	var x = Math.round(mousedown_node.x + nodeRadius * Math.cos(angle));
	var y = Math.round(mousedown_node.y + nodeRadius * Math.sin(angle));
	drag_line.attr('d', function() {
	    if(hover_node === mousedown_node){
		var x1 = Math.round(80 * Math.cos(angle + Math.PI / 4));
		var y1 = Math.round(80 * Math.sin(angle + Math.PI / 4));
		var x2 = Math.round(80 * Math.cos(angle - Math.PI / 4));
		var y2 = Math.round(80 * Math.sin(angle - Math.PI / 4));
		var x3 = Math.round(6 * Math.cos(angle - Math.PI / 4));
		var y3 = Math.round(6 * Math.sin(angle - Math.PI / 4));
		return 'M' + x + ',' + y + ' c' + x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' + x3 + ',' + y3 + '';
	    }
	    else
		return 'M' + x + ',' + y + 'L' + d3.mouse(this)[0] + ',' + d3.mouse(this)[1];
	});

	drag_label.attr( 'x', function() {
	    if(hover_node === mousedown_node){
		var ax = Math.round(70 * Math.cos(angle + Math.PI / 4));
		var bx = Math.round(70 * Math.cos(angle - Math.PI / 4));
		return x + (ax + bx) / 2;
	    }
	    else{
		if(mousedown_node.x > d3.mouse(this)[0]){
		    textDev = textDev + 7;
		} else{
		    textDev = textDev-15;
		}
		return (mousedown_node.x + d3.mouse(this)[0]) / 2 + Math.cos(nangle) * (textDev - 15); }
	})
	    .attr('y', function() {
		if(hover_node === mousedown_node){
		    var ay = Math.round(70 * Math.sin(angle + Math.PI / 4));
		    var by = Math.round(70 * Math.sin(angle - Math.PI / 4));
		    if(y > mousedown_node.y)
			return y + 10 + (ay + by) / 2;
		    return y + (ay + by) / 2;
		}
		else{
		    if(mousedown_node.x > d3.mouse(this)[0]) {
			textDev = textDev - 22;
		    } else {
			textDev = textDev - 10;
		    }
		    return (mousedown_node.y + d3.mouse(this)[1]) / 2 + Math.sin(nangle) * textDev; }
	    });

	restart();
    }

    /**
     * General behavior for mouseup event
     *
     */
    function mouseup() {
	hidden_link = null;
	svg.classed('ctrl', false);
	// because :active only works in WebKit?
	svg.classed('active', false);

	if(mousedown_node) {
	    if(draggingEntire){
		// add link to graph (update if exists)
		for(var i = 0; i < alphabet.length; i++)
		{
		    if(drag_trans[i]){
			var t = []
			for(var j = 0; j < alphabet.length; j++){
			    t[j] = false;
			}
			t[i] = true;
			var refl = false;
			if(mousedown_node === old_target) {
			    refl = true;
			    mousedown_node.reflexiveNum=drag_trans.length;
			}
			links.push({source: mousedown_node, target: old_target, reflexive: refl, trans: t});
		    }
		}

		links.splice(links.indexOf(mousedown_link), 1);
	    }

	    var t = [];
	    for(var i = 0; i < alphabet.length; i++)
		t[i] = false;
	    drag_trans = t;


	    // hide drag line
	    drag_line
		.classed('hidden', true)
		.style('marker-end', '');
	    drag_label
		.classed('hidden', true);

	    var t = [];
	    for(var i = 0; i < alphabet.length; i++)
		t[i] = false;
	    drag_trans = t;

	}

	// clear mouse event vars
	resetMouseVars();
	draggingLink = false;
	draggingEntire = false;
	draggingNode = false;
	newLink = false;
	linkNums(links);
	restart();
    }

    /**
     * Deletes all transitions involving a given state
     *
     */
    function spliceLinksForNode(node) {
	var toSpliceSource = links.filter(function(l) {
	    return (l.source === node);
	});
	toSpliceSource.map(function(l) {
	    links.splice(links.indexOf(l), 1);
	});
	
	var toSpliceTarget = links.filter(function(l) {
	    return (l.target === node);
	});
	// If transition to deleted node, loops back to source
	// if deterministic, and deletes if nondeterministic
	if(deterministic)
	{
	    toSpliceTarget.map(function(l) {
		l.target = l.source;
		l.reflexive = true;
		l.source.reflexiveNum++;
	    });
	}
	else {    
	    toSpliceTarget.map(function(l) {
		links.splice(links.indexOf(l), 1);
	    });
	}
    }
    
    /**
     * Generates the label for a given transition
     *
     */
    function makeLabel(trans) {
	var numLabel = 0;
	var label = "";

	for(var i = 0; i < alphabet.length; i++) {
	    if(trans[i])
		numLabel++;
	}

	for(var i = 0; i < alphabet.length; i++) {
	    if(trans[i]) {
		if(numLabel > 1){
		    label += alphabet[i] + " ";
		    numLabel--;
		}
		else
		    label += alphabet[i];
	    }
	}

	return label;
    }

    /**
     * Assigns an order to all transitions between common states
     *
     * (e.g. if there is a transition 'a' from state 1 to state 2
     * and a transition 'b' also from state 1 to state 2, one will
     * be given a linkNum of 0, and the other 1)
     *
     * Used to properly spaces labels 
     */
    function linkNums(l) {

	var multipleLinks = l.filter(function(link) {
	    var temp = false;

	    for(var i = 0; i < l.length; i++){
		var transIssue = false;
		for(var j = 0; j < alphabet.length; j++){
		    if(l[i].trans[j] && link.trans[j])
			transIssue = true;
		}

		if(l[i].source === link.source && l[i].target === link.target && l.indexOf(link) < i && transIssue)
		    temp = true;
	    }

	    if(epsilonTrans && link.trans[alphabet.length - 1] && link.source === link.target)
		temp = true;

	    return temp;
	});

	multipleLinks.map(function(link) {
	    l.splice(l.indexOf(link), 1);
	});


	//any links with duplicate source and target get an incremented 'linknum'
	for (var i=0; i<l.length; i++) {
	    var temp = 1;
	    var flat = true;

	    for (var j = 0; j < i; j++) {
		if(l[j].source === l[i].source && l[j].target === l[i].target)
		    temp++;
	    }
	    l[i].linknum = temp;

	    var total = 0;

	    for (var j = 0; j < l.length; j++) {
		if(l[j].target === l[i].source && l[j].source === l[i].target)
		    flat = false;
		if(l[j].source === l[i].source && l[j].target === l[i].target)
		    total++;
	    }

	    l[i].flat = flat;

	    if(total > 1)
		flat = false;
	    if(flat)
		l[i].linknum = 0;

	    l[i].totnum = total;

	    if(l[i].source === l[i].target)
		l[i].source.reflexiveNum = total;
	}
    }

    /**
     * Method for when user begins to drag a node
     *
     */
    function dragstart(d, i) {
	force.stop() // stops the force auto positioning before you start dragging
    }

    /**
     * Method describing behavior of when user is dragging a node
     *
     */
    function dragmove(d, i) {
        var tmp_px = d.px+d3.event.dx;
        var tmp_py = d.py+d3.event.dy;
        var tmp_x = d.x+d3.event.dx;
        var tmp_y = d.y+d3.event.dy;
        
        if(tmp_x < 5 || tmp_x>width-5 || tmp_y < 5 || tmp_y>height-5){
            draggingNode = false;
        }else{
            d.px = tmp_px;
            d.py = tmp_py;
            d.x = tmp_x;
            d.y = tmp_y;
        }
        tick();  // this is the key to make it work together with updating both px,py,x,y on d !
    }

    /**
     * Method for when user stops dragging a node
     *
     */
    function dragend(d, i) {
	if(overTrash && !d.initial){
	    spliceLinksForNode(d);
	    nodes.splice(nodes.indexOf(d), 1);
	    mousedown_node = null;
	    menu_node = null;
	    linkNums(links);
	    restart();
	}

	if(overTrash && d.initial){
	    d.x = 200;
	    d.y = 240;

	    warningText.text('Cannot delete initial node');
	    showWarning = true;
	    restart();
	    showWarning = false;
	}

	tick();
	force.resume();
    }

    /**
     * Calculates the angle given by dx and dy
     *
     */
    function getAngle(dx, dy) {
	var slope = dy / dx;
	var angle = Math.atan(slope);
	if (dy === 0 && dx < 0)
	    angle = 1 * Math.PI;
	else if (dy === 0 && dx >= 0)
	    angle = 0;
	else if (dx === 0 && dy < 0)
	    angle = -1 * Math.PI / 2;
	else if (dx === 0 && dy >= 0)
	    angle = 1 * Math.PI / 2;
	else
	    angle = Math.atan(dy / dx);
	if (dx < 0 && dy != 0)
	    angle = angle + Math.PI;
	return angle;
    }

    /**
     * Adds a node to the interface
     *
     */
    function addNode(x, y) {
	// insert new node at point
	var idNum = (function () {
    		/* Since all id's are in the range [0,nodes.length), the last iteration of the for-loop
		 	 * will return. Earlier iterations may return early */
    		for(var i = 0; i <= nodes.length; i++) {
				if(!nodes.some(function (node, index, array) { return node.id === i })) {
					return i
				}
			}
    	})();

	var reflNum = 0;
	if(deterministic)
	    reflNum = alphabet.length;
	
	var node = {id: idNum, initial: false, accepting: false, reflexiveNum: reflNum, flip: true, menu_visible: false};
	node.x = x;
	node.y = y;
	nodes.push(node);

	if(deterministic){
	    for(var i = 0; i < alphabet.length; i++){
		var t = [];
		for(var j = 0; j < alphabet.length; j++){
		    if(i === j)
			t[j] = true;
		    else
			t[j] = false;
		}
		links.push({source: node, target: node, reflexive: true, trans: t});
	    }

	    linkNums(links);
	}
	
	return idNum;
    }

    /**
     * Local function to initializes the interface
     *
     */
    function init(){
	initial_node = null;
	nodes = [];
	links = [];
	nodes.length = 0;
	links.length = 0;

	resetMouseVars();

	restart();

	addNode(200, 240);
	nodes[0].initial = true;
	
	initial_node = nodes[0];

	restart();
    }
    
    /**
     * Describes the right click menu for interface
     *
     */
    $(container).contextMenu(
    	{menu: 'cmenu_canvas', inSpeed: 200, outSpeed: 300},
		function(action, el, pos, evt) {
		    switch ( action ) {
		    case 'add':
				addNode(mouse_x, mouse_y);
				restart();
				break;
		    case 'remove':
				spliceLinksForNode(menu_node);
				nodes.splice(nodes.indexOf(menu_node), 1);
				hidden_link = null;
				linkNums(links);
				restart();
				break;
		    case 'final':
		    case 'non-final':
				menu_node.accepting = !menu_node.accepting;
				restart();
				break;
		    case 'init':
				for(var i = 0; i < nodes.length; i++) {
				    nodes[i].initial = false;
				}
				menu_node.initial = true;
				initial_node = menu_node;
				restart();
				break;
		    case 'flip':
				menu_node.flip = !menu_node.flip;
				restart();
				break;
		    case 'flip_edge':
				menu_link.source.flip = !menu_link.source.flip;
				restart();
				break;
		    case 'remove_edge':
				var toSplice = links.filter( function(l) {
				    return (l.source === menu_link.source && l.target === menu_link.target);
				});

				toSplice.map(function(l) {
				    links.splice(links.indexOf(l), 1);
				});
				restart();
				break;
		    case 'remove_edge_label':
				links.splice(links.indexOf(menu_link), 1);
				restart();
				break;
		    default:
				break;
		    }
		},
		function(e) {
		    var menu_items = $('#cmenu_canvas > li');
		    menu_items.disableContextMenu();
		    if(hover_node){
				if(hover_node.accepting) {
					menu_items.enableContextMenuItems('#non-final');
				} else {
					menu_items.enableContextMenuItems('#final');
				}

				if(hover_node.reflexiveNum > 0) {
					menu_items.enableContextMenuItems('#flip')
				}

				if(!(hover_node.initial)) {
					menu_items.enableContextMenuItems('#remove,#init')
				}
		    } else if (hover_link) {
				if(hover_label && !deterministic && hover_link.reflexive) {
				    menu_items.enableContextMenuItems('#remove_edge_label,#flip_edge');
				} else if(hover_label && !deterministic) {
				    menu_items.enableContextMenuItems('#remove_edge_label');
				}  else if(hover_link.reflexive && !deterministic) {
				    menu_items.enableContextMenuItems('#remove_edge,#flip_edge');
				} else if (hover_link.reflexive && deterministic) {
				    menu_items.enableContextMenuItems('#flip_edge');
				} else if (!deterministic) {
				    menu_items.enableContextMenuItems('#remove_edge');
				}
		    } else {
				menu_items.enableContextMenuItems('#add');
		    }
		});

    /**
     * Public function to initialize the interface
     *
     */
    this.initialize = function() {
	
	if(!started){
	    force = d3.layout.force()
		.nodes(nodes)
		.links(links)
		.size([width, height])
		.on('tick', tick);

	    node_drag = d3.behavior.drag()
		.on("dragstart", dragstart)
		.on("drag", dragmove)
		.on("dragend", dragend);

	    svg.on('mousedown', mousedown)
		.on('mousemove', mousemove)
		.on('mouseup', mouseup);

	    started = true;
	}
	
	this.clear();
	addNode(200, 240);
	nodes[0].initial = true;
	
	initial_node = nodes[0];
	
	restart();
    }

    /**
     * Draws automaton described by xml
     *
     */
    this.setAutomaton = function (xml) {

		if(!started) {
		    this.initialize();
		}

		var xmlDoc = Utils.text2xml(xml);
		var alph = xmlDoc.getElementsByTagName("alphabet")[0];
		var symbolTags = alph.getElementsByTagName("symbol");
		var symbols = new Array();
		for (i = 0; i < symbolTags.length; i++) {
		    symbols.push(symbolTags[i].firstChild.nodeValue.trim());
		}
		this.setAlphabet(symbols);

		initial_node = null;
		nodes = [];
		links = [];
		nodes.length = 0;
		links.length = 0;
		resetMouseVars();
		restart();

		var stateTags = xmlDoc.getElementsByTagName("stateSet")[0].getElementsByTagName("state");
		for (i = 0; i < stateTags.length; i++) {
		    var currState = stateTags[i];
		    var posX = parseFloat(currState.getElementsByTagName("posX")[0].firstChild.nodeValue);
		    var posY = parseFloat(currState.getElementsByTagName("posY")[0].firstChild.nodeValue);
		    var nodeId = parseInt(currState.getElementsByTagName("label")[0].firstChild.nodeValue);
		    addNode(posX, posY);
		    nodes[nodes.length - 1].id = nodeId;
		}

		//TODO merge edges that have the same source+target and concat the labels
		var edgeTags = xmlDoc.getElementsByTagName("transitionSet")[0].getElementsByTagName("transition");
		for (i = 0; i < edgeTags.length; i++) {
		    var currEdge = edgeTags[i];
		    var from = parseInt(currEdge.getElementsByTagName("from")[0].firstChild.nodeValue);
		    var to = parseInt(currEdge.getElementsByTagName("to")[0].firstChild.nodeValue);
		    var read = currEdge.getElementsByTagName("read")[0].firstChild.nodeValue.trim();
		    
		    var transArray = [];
		    for(var j = 0; j < alphabet.length; j++){
		    	transArray.push(alphabet[j] === read)
		    }

		    var fromNodeIndex = nodes.findIndex(function (node) { return node.id == from});
		    var fromNode = nodes[fromNodeIndex];
		    
		    var toNodeIndex = nodes.findIndex(function (node) { return node.id == to});
		    var toNode = nodes[toNodeIndex];

		    var refl = (fromNode === toNode);

		    links.push({source: fromNode, target: toNode, trans: transArray, reflexive: refl});
		}

		var accTags = xmlDoc.getElementsByTagName("acceptingSet")[0].getElementsByTagName("state");
		for (i = 0; i < accTags.length; i++) {
		    var nodeId = parseInt(accTags[i].getAttribute('sid'));
		    
		    for(var j = 0; j < nodes.length; j++){
			if(nodes[j].id === nodeId)
			    nodes[j].accepting = true;
		    }
		}

		var initTag = xmlDoc.getElementsByTagName("initState")[0].getElementsByTagName("state");
		var initId = parseInt(initTag[0].getAttribute('sid'));
		initial_node = nodes[0];
		for(i = 0; i < nodes.length; i++) {
		    if(nodes[i].id === initId){
				nodes[i].initial = true;
				initial_node = nodes[i];
		    }
		}

		restart();
    }

    /**
     * Compiles xml describing alphabet of automaton
     *
     */
    this.exportAlphabet = function () {
		//Alphabet
		var alpha = "	<alphabet>\n";
		for (var i = 0; i < alphabet.length; i++){
		    alpha = alpha + " <symbol>" + alphabet[i] + "</symbol>\n";
		}
		alpha = alpha + "	</alphabet>\n";

		return alpha;
    }

    /**
     * Compiles xml describing automatonHint 
     *
     */
    this.exportAutomatonHint = function () {
		var aut = this.exportAutomaton();
		var level = "<level>" + $('input[name=feedlev]:radio:checked').val() + "</level>\n";
		var metrics = "<metrics>" + $('input[name=enabFeed]:checkbox:checked').map(function (value, index) { return value; }).get().join(",") + "</metrics>\n"

		return "<automatonHint>\n" + aut + level + metrics + "</automatonHint>";
    }

    //export a simple text version
    this.exportAutomaton = function () {
		//Alphabet
		var alpha = this.exportAlphabet();

		//States
		var states = "	<stateSet>\n";

		var accepting = new Array(),
		init = false,
		initState = "<initState><state sid='" + initial_node.id + "' /></initState>";

		for(var i = 0; i < nodes.length; i++){
			if(nodes[i].accepting){
				accepting.push(nodes[i].id);
			}

			states = states + "		<state sid='" + nodes[i].id + "' ><label>" + nodes[i].id + "</label><posX>" + Math.round(parseFloat(nodes[i].x)) + "</posX><posY>" + Math.round(parseFloat(nodes[i].y)) + "</posY></state>\n";

		}
		states = states + "	</stateSet>\n";

		// Transitions
		var transitions = "	<transitionSet>\n";

		var transitionNo = 0;
		for(var i = 0; i < links.length; i++){
			if(!links[i].hidden){
				var fromId = links[i].source.id;
				var toId = links[i].target.id;
				var edgeDistance = 30 + "";
				var labels = [];

				for(var j = 0; j < alphabet.length; j++){
					if(links[i].trans[j])
						labels.push(alphabet[j]);
				}

				for(var j = 0; j < labels.length; j++) {
					transitions = transitions + "		<transition tid='" + transitionNo + "'>\n"
					+ "			<from>" + fromId + "</from>\n"
					+ "			<to>" + toId + "</to>\n"
					+ "			<read>" + labels[j] + "</read>\n"
					+ "			<edgeDistance>" + edgeDistance + "</edgeDistance>\n"
					+ "		</transition>\n";
					transitionNo = transitionNo + 1;
				}
			}
		}
		transitions = transitions + "	</transitionSet>\n";

		var acc = "	<acceptingSet>\n"
		for (var i = 0; i < accepting.length; i++) {
			acc = acc + "		<state sid='" + accepting[i] + "'/>\n"
		}
		acc = acc + "	</acceptingSet>\n"

		var ret = "<automaton>\n" + alpha + states + transitions + acc + initState + "</automaton>\n";
		return ret;
	}

    /**
     * Clears the interface
     *
     */
     this.clear = function () {
     	nodes = [];
     	links = [];
     	nodes.length = 0;
     	links.length = 0;
     	initial_node = null;

     	resetMouseVars();

     	restart();
     }

    /**
     * Sets the alphabet
     *
     */
     this.setAlphabet = function (alph) {
     	alphabet = alph;

     	if(epsilonTrans && !deterministic){
     		alphabet.push('ε');
     	}

     	this.initialize();
     }

    /**
     * Sets whether or not to use epsilon transitions
     *
     */
     this.setEpsilon = function(b) {
     	epsilonTrans = b;

     	this.setAlphabet(alphabet);
     }

    /**
     * Locks the interface, so it is static display
     *
     */
     this.lockCanvas = function() {
     	svg.style('pointer-events', 'none');
     	hoverPath.style('pointer-events', 'none');
     	path.style('pointer-events', 'none');
     	hoverMenu.style('pointer-events', 'none');
     	circle.style('pointer-events', 'none');
     	labels.style('pointer-events', 'none');

     	trashLabel.style('visibility', 'hidden');
     	clearRect.style('visibility', 'hidden');
     	clearText.style('visibility', 'hidden');
     }

    /**
     * Unlocks the interface, so it is interactive
     *
     */
     this.unlockCanvas = function() {
     	svg.style('pointer-events', 'auto');
     	hoverPath.style('pointer-events', 'auto');
     	path.style('pointer-events', 'auto');
     	hoverMenu.style('pointer-events', 'auto');
     	circle.style('pointer-events', 'auto');
     	labels.style('pointer-events', 'auto');

     	trashLabel.style('visibility', 'visible');
     	clearRect.style('visibility', 'visible');
     	clearText.style('visibility', 'visible');
     }
}