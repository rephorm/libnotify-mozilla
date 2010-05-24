#!/usr/bin/env python

import gobject
import gtk
import sys
import time

try:
	import indicate
except:
	indicate = None

mainserver = 0
desktop_file = "/usr/share/applications/thunderbird.desktop"

def timeout_cb(indicator):
	global mainserver
	mainserver.hide()
	gtk.main_quit()
	return True

def newIndicator(arg):
	indicator = indicate.Indicator()
	indicator.set_property("name", arg)
	indicator.set_property_time("time", time.time())
	indicator.show()
	gobject.timeout_add_seconds(1, timeout_cb, indicator)

if __name__ == "__main__":

	# Setup the server
	mainserver = indicate.indicate_server_ref_default()
	mainserver.set_type("message.im")
	mainserver.set_desktop_file(desktop_file)
	mainserver.show()

	newIndicator("Quitting Thunderbird...");    

	gtk.main()
