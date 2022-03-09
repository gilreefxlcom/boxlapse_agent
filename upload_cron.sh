#!/bin/bash
#exec >> /home/pi/debug.txt 2>&1

TakePhoto () {
  echo "Taking photo - Filename="$name
  /usr/local/bin/gphoto2 --capture-image-and-download --filename=/home/pi/$name
  TakePhotoOK=$?
}

CopyToGdrive () {
	echo `date`" ***** Copy to gdrive *****"
	cp /home/pi/$name /home/pi/mnt/gdrive/$name
	ls /home/pi/mnt/gdrive/$name
	CopyToGdriveOK=$?
}

CheckGdriveMount () {
	df|grep gdrive
	CheckGdriveMountOK=$?
}

CopyToLocal () {
	echo `date`" ***** Copied to gdrive Failed - moving to local, send email *****"
	mv /home/pi/$name /home/pi/TO_COPY
	sudo python email-copy-failed.py
}
ConvertAndCopyToDO(){
mkdir /home/pi/ufraw  >/dev/null 2>&1
NAME=$1
HOSTNAME=`hostname`
rm -rf /home/pi/ufraw/*
ufraw-batch --embedded-image --output=/home/pi/ufraw/$NAME.jpg /home/pi/$NAME
convert /home/pi/ufraw/$NAME.jpg -resize 10% /home/pi/ufraw/$NAME.small.jpg
s3cmd put --acl-public /home/pi/ufraw/$NAME.small.jpg s3://highlapse/$HOSTNAME/$NAME.small.jpg
# Creat LIst #
s3cmd ls s3://highlapse/$HOSTNAME/ | cut -d'/' -f5  | grep jpg > /home/pi/ufraw/list_tmp.txt
for LIST in `cat /home/pi/ufraw/list_tmp.txt`
do
	echo "https://highlapse.fra1.digitaloceanspaces.com/Boxlapse5/"$LIST >> /home/pi/ufraw/list.txt

done
s3cmd put --acl-public /home/pi/ufraw/list.txt s3://highlapse/$HOSTNAME/list.txt
}

echo `date`" ***** STARTED *****"
killall -9 /usr/lib/gvfs/gvfs-gphoto2-volume-monitor >/dev/null 2>&1
ext=cr2
name=`date +%Y-%m-%dT%H:%M:%S`"."$ext
TakePhotoRetry=3
COPYRETRY=3
COPYTODO=0

while [ $TakePhotoRetry -gt 0 ]
do
	TakePhoto
	if [ $TakePhotoOK -eq 0 ]
	then
		while [ $COPYRETRY -gt 0 ]
		do
			CheckGdriveMount
			if [ $CheckGdriveMountOK -eq 0 ]
			then
				CopyToGdrive
				if [ $CopyToGdriveOK -eq 0 ]
				then
					echo `date`" ***** Copy to gdrive OK *****"
					if [ $COPYTODO -eq "1" ]
					then
					echo `date`" ***** Copy to Digital Ocean *****"
					ConvertAndCopyToDO $name
					fi
					echo `date` "***** Delete local file *****"
					rm -rf /home/pi/$name
					COPYRETRY=0
				else
					COPYRETRY=$((COPYRETRY-1))
					if [ $COPYRETRY -eq 0 ]
					then
						CopyToLocal
					fi
				fi
			else
				systemctl --user start rclone@gdrive
				COPYRETRY=$((COPYRETRY-1))
				if [ $COPYRETRY -eq 0 ]
				then
					echo `date`" ***** Mount to gdrive Failed - moving to local, send email *****"
					CopyToLocal
				fi
			fi
		done
		TakePhotoRetry=0
	else
		TakePhotoRetry=$((TakePhotoRetry-1))
		echo `date`" ***** Camera Not Responding - Restarting Camera and retry=$TakePhotoRetry *****"
		echo `usbreset`
		usbreset `usbreset | grep Canon | cut -d" " -f4`
		curl -X POST https://maker.ifttt.com/trigger/boxlapse6_camera_restart_p3/with/key/cYRwJwu5pbXUw2-Yhzqxt1
		sleep 10
	fi
done
echo "*****FINISHED*****"
exit
