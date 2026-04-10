from django.http import JsonResponse
from django.urls import path


def health(request):
    return JsonResponse({"ok": True, "service": "rtdraw-django"})


urlpatterns = [
    path("", health),
    path("health/", health),
]
