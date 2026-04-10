import os

from django.core.asgi import get_asgi_application
from socketio import ASGIApp

from rooms.socket_events import sio


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "whiteboard.settings")

django_asgi_app = get_asgi_application()
application = ASGIApp(sio, django_asgi_app)
