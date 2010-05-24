#!/usr/bin/env python

import gobject
import gtk
import sys
import time
import os

try:
	import indicate
except:
	indicate = None

desktop_file = "/usr/share/applications/thunderbird.desktop"
indicatorcount = 0
notme = False
other_file = 0
mainserver = 0

def desktop_cb(listener, server, value):
	global other_file
	other_file = value

def server_added(listener, server, typ):
	global other_file
	global notme
	global desktop_file
	global mainserver
	listener.server_get_desktop(server, desktop_cb)
	if other_file == desktop_file and notme:
		mainserver.hide()
		gtk.main_quit()
	notme = True

def timeout_cb(indicator):
	return True
	
def display(indicator, something):
	global indicatorcount
	indicator.hide()
	os.system("thunderbird &")
	indicatorcount -= 1
	if indicatorcount == 0:
		gtk.main_quit()

def server_display(server, something):
	pass

def newIndicator(name):
	global indicatorcount
	# Setup the message
	indicator = indicate.Indicator()
	indicator.set_property("subtype", "account")
	indicator.set_property("sender", name)
	indicator.set_property_time("time", time.time())
	indicator.set_property("draw-attention", "true")
	indicator.show()
	indicator.connect("user-display", display)
	gobject.timeout_add_seconds(5, timeout_cb, indicator)
	indicatorcount += 1

if __name__ == "__main__":
	# Setup the server
	mainserver = indicate.indicate_server_ref_default()
	mainserver.set_type("message.thunderbird")
	mainserver.set_desktop_file(desktop_file)
	mainserver.connect("server-display", server_display)
	mainserver.show()

	# Command line arguments
	i = 0;
	for arg in sys.argv:
		if(i==1):
			newIndicator(arg)
		else:
			i = 1;

	# Listen for new server
	listener = indicate.indicate_listener_ref_default()
	listener.connect("server-added", server_added)
	
	# Loop
	gtk.main()
